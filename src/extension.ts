import {
    commands, window, workspace, tasks, l10n,
    ExtensionContext, ConfigurationTarget,
    Uri, TreeItem, EventEmitter,
} from 'vscode';
import { basename, sep } from 'path';
import * as python from './python';
import * as shellTask from './shellTask';
import * as blocks from './blockFilter';
import * as modtool from './modtool';
import { GNURadioModuleTreeDataProvider } from './moduleTree';

export async function activate(context: ExtensionContext) {
    const extId: string = context.extension.packageJSON.name;

    const getConfig = <T>(key: string) => workspace.getConfiguration(extId).get<T>(key);
    const setConfig = <T>(key: string, value?: T) => workspace.getConfiguration(extId)
        .update(key, value, ConfigurationTarget.Global);

    const cwd = workspace.workspaceFolders?.length
        ? workspace.workspaceFolders[0].uri.fsPath
        : undefined;
    let pythonInterp: string;
    let gnuradioPrefix = getConfig<string>('gnuradioPrefix');
    if (!gnuradioPrefix?.length) {
        gnuradioPrefix = undefined;
    }
    try {
        const pythonEnv = await python.getPythonEnv();
        pythonEnv.onDidChange(async e => {
            if (e.path === pythonInterp || e.path === pythonEnv.path) {
                return;
            }
            if (await window.showWarningMessage('Python environment has changed.', 'Reload window') === 'Reload window') {
                commands.executeCommand('workbench.action.reloadWindow');
            }
        });
        gnuradioPrefix ??= pythonEnv.path;  // venv and conda environments
        pythonInterp = python.findPython(pythonEnv.pythonInterp);
    } catch (err) {
        if (err instanceof TypeError) {
            pythonInterp = python.findPython(getConfig<string>('python.defaultInterpreter'));
            window.showWarningMessage(`Python extension not found; using default interpreter (${pythonInterp})`, 'Find extension')
                .then(value => {
                    if (value === 'Find extension') {
                        commands.executeCommand('workbench.extensions.search', 'ms-python.python');
                    }
                });
        } else {
            throw err;
        }
    }
    const pythonpath = python.getPythonpath(
        pythonInterp, gnuradioPrefix,
        getConfig<string[]>('python.defaultPythonpath'));
    const execOptions = { cwd, pythonpath, gnuradioPrefix };

    /** 
     * Open GNURadio Companion application.
     * 
     * This command runs `gnuradio-companion` in the shell.
     */
    const openGnuradioCompanion = commands.registerCommand(
        `${extId}.openGnuradioCompanion`,
        () => shellTask.exec('gnuradio-companion', execOptions));

    const execOnFlowgraph = async (cmd: string, fileUri?: Uri) => {
        try {
            await shellTask.execOnFile(cmd, fileUri, { fileExtension: '.grc', ...execOptions });
        } catch (err: unknown) {
            if (err instanceof URIError) {
                window.showErrorMessage(err.message);
            } else {
                throw err;
            }
        }
    };

    /** 
     * Edit the file in GNURadio Companion application.
     * 
     * This command runs `gnuradio-companion %f` in the shell, opening the selected file `%f`.
     */
    const editInGnuradioCompanion = commands.registerCommand(
        `${extId}.editInGnuradioCompanion`,
        (fileUri?: Uri) => execOnFlowgraph('gnuradio-companion', fileUri));

    /**
     * Compile the GRC flowgraph file.
     * 
     * This command runs `grcc %f` in the shell, producing a Python executable in the same folder as the selected file `%f`.
     */
    const compileFlowgraph = commands.registerCommand(
        `${extId}.compileFlowgraph`,
        (fileUri?: Uri) => execOnFlowgraph('grcc', fileUri));

    /**
     * Run the GRC flowgraph file.
     * 
     * This command runs `grcc -r %f` in the shell, producing a Python executable in the same folder as the selected file `%f` and running it.
     */
    const runFlowgraph = commands.registerCommand(
        `${extId}.runFlowgraph`,
        (fileUri?: Uri) => execOnFlowgraph('grcc -r', fileUri));

    context.subscriptions.push(
        openGnuradioCompanion,
        editInGnuradioCompanion,
        compileFlowgraph,
        runFlowgraph,
        tasks.onDidEndTaskProcess(e => {
            const taskCmd = shellTask.onEndTaskShellCommand(e);
            if (RegExp(`[\\${sep}]?(grcc)`).test(taskCmd ?? '')) {
                // TODO: C++ flowgraph?
                // TODO: read task parameters to find the compiled file
                window.showInformationMessage('Flowgraph compilation was successfull');
            }
        }),
    );

    const scriptPath = Uri.joinPath(context.extensionUri, 'src', 'modtool').fsPath;
    const shell = python.PythonShell.default(
        scriptPath, context.extension.packageJSON.displayName,
        pythonInterp, { pythonpath, gnuradioPrefix });

    context.subscriptions.push(
        commands.registerCommand(
            `${extId}.createModule`,
            () => modtool.createModule(shell)),
    );

    if (!cwd) {
        return;
    }

    const modtoolEvent = new EventEmitter<string[]>();
    context.subscriptions.push(modtoolEvent);
    const execModtool: modtool.ModtoolClosure = async (cmd, ...args) => {
        shell.outputChannel.appendLine(`\n[Running] gr_modtool ${cmd} ${args.join(' ')}`);
        const command = [cmd + '.py', ...args];
        return await shell.run(command, cwd).then(
            output => {
                modtoolEvent.fire(command);
                return output;
            },
            (err: unknown) => {
                if (err instanceof python.PythonShellError) {
                    return err;
                } else {
                    throw err;
                }
            }
        );
    };

    const catchModtoolError = (err: unknown) => {
        if (err instanceof modtool.ModtoolError) {
            return window.showErrorMessage(err.message);
        } else {
            throw err;
        }
    };

    // Detect OOT module in the current working directory
    let moduleName: string;
    try {
        moduleName = (await modtool.getModuleInfo(execModtool, true)).modname;
    } catch (err) {
        catchModtoolError(err);
        const noModule = () => window.showErrorMessage("No GNURadio Module detected in the open workspace");
        context.subscriptions.push(commands.registerCommand(`${extId}.getModuleInfo`, noModule));
        return;
    }
    commands.executeCommand('setContext', `${extId}.moduleFound`, true);

    // Command Palette
    context.subscriptions.push(
        commands.registerCommand(
            `${extId}.getModuleInfo`,
            () => modtool.getModuleInfo(execModtool)
                .catch(catchModtoolError)),
        commands.registerCommand(
            `${extId}.createBlock`,
            () => modtool.createBlock(execModtool, context.extensionUri, cwd, moduleName)
                .catch(catchModtoolError)),
        commands.registerCommand(
            `${extId}.createPythonBindings`,
            () => modtool.createPythonBindings(execModtool, cwd, moduleName)
                .catch(catchModtoolError)),
        commands.registerCommand(
            `${extId}.renameBlock`,
            () => modtool.renameBlock(execModtool, cwd, moduleName)
                .catch(catchModtoolError)),
        commands.registerCommand(
            `${extId}.disableBlock`,
            () => modtool.disableBlock(execModtool, cwd, moduleName)
                .catch(catchModtoolError)),
        commands.registerCommand(
            `${extId}.removeBlock`,
            () => modtool.removeBlock(execModtool, cwd, moduleName)
                .catch(catchModtoolError)),
        commands.registerCommand(
            `${extId}.convertXmlToYaml`,
            () => modtool.convertXmlToYaml(execModtool, cwd, moduleName)
                .catch(catchModtoolError)),
        commands.registerCommand(
            `${extId}.makeYamlFromImpl`,
            () => modtool.makeYamlFromImpl(execModtool, cwd, moduleName)
                .catch(catchModtoolError)),
    );

    // File Explorer Context Menu
    context.subscriptions.push(
        commands.registerCommand(
            `${extId}.createPythonBindingsInExplorer`,
            (blockUri: Uri) => {
                if (!blockUri) {
                    return window.showErrorMessage('No file provided!');
                }
                if (!blocks.filterCppBlocks(blockUri.fsPath)) {
                    return window.showErrorMessage(`Invalid file type: expected a header (.h), found ${basename(blockUri.fsPath)}`);
                }
                const blockName = blocks.mapCppBlocks(blockUri.fsPath);
                return modtool.createPythonBindings(execModtool, cwd, moduleName, blockName)
                    .catch(catchModtoolError);
            }),
        commands.registerCommand(
            `${extId}.convertXmlToYamlInExplorer`,
            (blockUri: Uri) => {
                if (!blockUri) {
                    return window.showErrorMessage('No file provided!');
                }
                if (!blocks.filterXmlBlocks(blockUri.fsPath)) {
                    return window.showErrorMessage(`Invalid file type: expected XML, found ${basename(blockUri.fsPath)}`);
                }
                const blockName = blocks.mapGrcBlocks('.xml')(blockUri.fsPath);
                return modtool.convertXmlToYaml(execModtool, cwd, moduleName, blockName)
                    .catch(catchModtoolError);
            }),
        commands.registerCommand(
            `${extId}.makeYamlFromImplInExplorer`,
            (blockUri: Uri) => {
                if (!blockUri) {
                    return window.showErrorMessage('No file provided!');
                }
                if (!blocks.filterCppImplFiles(blockUri.fsPath)) {
                    return window.showErrorMessage(`Invalid file type: expected C++ source, found ${basename(blockUri.fsPath)}`);
                }
                const blockName = blocks.mapCppImplFiles(blockUri.fsPath);
                return modtool.makeYamlFromImpl(execModtool, cwd, moduleName, blockName)
                    .catch(catchModtoolError);
            }),
    );

    /**
     * Check for old XML block definitions in the OOT module.
     * 
     * If any are found, asks if the user wants to update them to YAML.
     */
    const checkXml = async () => {
        const xmlBlocks = blocks.getXmlBlocks(cwd, moduleName);
        commands.executeCommand('setContext', `${extId}.xmlFound`, xmlBlocks.length > 0);
        if (!xmlBlocks.length) {
            return;
        }
        const yes = l10n.t("Yes"), no = l10n.t("No"), dontShowAgain = l10n.t("Don't Show Again");
        let updateAll = await window.showInformationMessage(
            'XML block definitions found. Update them to YAML?', yes, no, dontShowAgain);
        if (updateAll === 'Yes') {
            await execModtool('update', '--complete');
            commands.executeCommand('setContext', `${extId}.xmlFound`, false);
            updateAll = await window.showInformationMessage(
                'Updated block definitions written to "grc/".', dontShowAgain);
        }
        if (updateAll === dontShowAgain) {
            setConfig('checkXml', false);
        }
    };
    if (getConfig<boolean>('modtool.checkXml') === true) {
        checkXml();
    }
    context.subscriptions.push(
        workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('gnuradio-integration.modtool.checkXml') &&
                getConfig<boolean>('modtool.checkXml') === true) {
                checkXml();
            }
        }),
    );

    const moduleTree = new GNURadioModuleTreeDataProvider(cwd, moduleName);

    const registerTreeItemAlias = (alias: string, command: string) =>
        commands.registerCommand(
            `${extId}.${alias}`,
            (item?: TreeItem) => {
                if (!item) {
                    if (!moduleTree.treeView.selection.length) {
                        return;
                    }
                    item = moduleTree.treeView.selection[0];
                }
                if (!item.resourceUri) {
                    return;
                }
                return commands.executeCommand(
                    command, item.resourceUri,
                );
            });

    const getBlockFromTreeItem = (item?: TreeItem) => {
        if (!item && moduleTree.treeView.selection.length) {
            item = moduleTree.treeView.selection[0];
        }
        if (!item || !item.contextValue?.startsWith('block')) {
            return;
        }
        return typeof item.label === 'object' ? item.label.label : item.label;
    };

    context.subscriptions.push(
        moduleTree,
        modtoolEvent.event((cmd: string[]) => {
            // TODO: 'bind', 'disable'
            if (['add', 'rename', 'rm', 'update', 'makeyaml'].includes(cmd[0])) {
                moduleTree.refresh();
            }
        }),
        commands.registerCommand(
            `${extId}.refreshView`,
            moduleTree.refresh,
            moduleTree),
        commands.registerCommand(
            `${extId}.renameBlockInTree`,
            (item?: TreeItem) => {
                const blockName = getBlockFromTreeItem(item);
                return modtool.renameBlock(execModtool, cwd, moduleName, blockName)
                    .catch(catchModtoolError);
            }),
        commands.registerCommand(
            `${extId}.removeBlockInTree`,
            (item?: TreeItem) => {
                const blockName = getBlockFromTreeItem(item);
                return modtool.removeBlock(execModtool, cwd, moduleName, blockName)
                    .catch(catchModtoolError);
            }),
        commands.registerCommand(
            `${extId}.createPythonBindingsInTree`,
            (item?: TreeItem) => {
                const blockName = getBlockFromTreeItem(item);
                return modtool.createPythonBindings(execModtool, cwd, moduleName, blockName)
                    .catch(catchModtoolError);
            }),
        commands.registerCommand(
            `${extId}.convertXmlToYamlInTree`,
            (item?: TreeItem) => {
                const blockName = getBlockFromTreeItem(item);
                return modtool.convertXmlToYaml(execModtool, cwd, moduleName, blockName)
                    .catch(catchModtoolError);
            }),
        registerTreeItemAlias('fileOpenBeside', 'explorer.openToSide'),
        registerTreeItemAlias('fileOpenFolder', 'revealFileInOS'),
        registerTreeItemAlias('fileOpenWith', 'explorer.openWith'),
        registerTreeItemAlias('fileOpenTimeline', 'files.openTimeline'),
        registerTreeItemAlias('fileCopyPath', 'copyFilePath'),
        registerTreeItemAlias('fileCopyPathRelative', 'copyRelativeFilePath'),
        registerTreeItemAlias('fileSelectForCompare', 'selectForCompare'),
        registerTreeItemAlias('fileCompareSelected', 'compareFiles'),
    );
}

export function deactivate() { }
