'use strict';

import * as vscode from 'vscode';
import { basename } from 'path';
import { PythonShell } from 'python-shell';
import { GNURadioController } from './controller';
import { exec, execOnFile } from './shellTask';
import * as blocks from './blockFilter';
import * as modtool from './modtool';
import { GNURadioModuleTreeDataProvider } from './moduleTree';

export async function activate(context: vscode.ExtensionContext) {
    const extId: string = context.extension.packageJSON.name;

    const getConfig = <T>(key: string) => vscode.workspace.getConfiguration(extId).get<T>(key);
    const setConfig = <T>(key: string, value?: T) => vscode.workspace.getConfiguration(extId)
        .update(key, value, vscode.ConfigurationTarget.Global);

    const cwd = vscode.workspace.workspaceFolders?.length
        ? vscode.workspace.workspaceFolders[0].uri.fsPath
        : undefined;

    /** 
     * Open GNURadio Companion application.
     * 
     * This command runs `gnuradio-companion` in the shell.
     */
    const openGnuradioCompanion = vscode.commands.registerCommand(
        `${extId}.openGnuradioCompanion`,
        () => {
            const cmd = getConfig<string>('companion.cmd') ?? 'gnuradio-companion';
            exec(`"${cmd}"`, cwd);
        });

    /** 
     * Edit the file in GNURadio Companion application.
     * 
     * This command runs `gnuradio-companion %f` in the shell, opening the selected file `%f`.
     */
    const editInGnuradioCompanion = vscode.commands.registerCommand(
        `${extId}.editInGnuradioCompanion`,
        (fileUri?: vscode.Uri) => {
            const cmd = getConfig<string>('companion.cmd') ?? 'gnuradio-companion';
            execOnFile(`"${cmd}"`, fileUri, '.grc');
        });

    /**
     * Compile the GRC flowgraph file.
     * 
     * This command runs `grcc %f` in the shell, producing a Python executable in the same folder as the selected file `%f`.
     */
    const compileFlowgraph = vscode.commands.registerCommand(
        `${extId}.compileFlowgraph`,
        (fileUri?: vscode.Uri) => {
            const cmd = getConfig<string>('compiler.cmd') ?? 'grcc';
            execOnFile(`"${cmd}"`, fileUri, '.grc');
        });

    /**
     * Run the GRC flowgraph file.
     * 
     * This command runs `grcc -r %f` in the shell, producing a Python executable in the same folder as the selected file `%f` and running it.
     */
    const runFlowgraph = vscode.commands.registerCommand(
        `${extId}.runFlowgraph`,
        (fileUri?: vscode.Uri) => {
            const cmd = getConfig<string>('compiler.cmd') ?? 'grcc';
            execOnFile(`"${cmd}" -r`, fileUri, '.grc');
        });

    context.subscriptions.push(
        openGnuradioCompanion,
        editInGnuradioCompanion,
        compileFlowgraph,
        runFlowgraph,
        vscode.tasks.onDidEndTaskProcess(e => {
            if (e.execution.task.source !== 'gnuradio') {
                return;
            }
            if (e.exitCode && e.exitCode !== 0) {
                vscode.window.showErrorMessage(
                    `Task finished with error code ${e.exitCode}; check the terminal output for details`);
            } else if (e.execution.task.detail?.startsWith('grcc')) {
                // TODO: C++ flowgraph?
                // TODO: read task parameters to find the compiled file
                vscode.window.showInformationMessage('Flowgraph compilation was successfull');
            }
        }),
    );

    const outputChannel = vscode.window.createOutputChannel(context.extension.packageJSON.displayName);
    const scriptPath = vscode.Uri.joinPath(context.extensionUri, 'src', 'modtool').fsPath;
    const execModtool: modtool.ModtoolClosure = async (command: string, ...args: string[]) => {
        outputChannel.appendLine(`\n[Running] gr_modtool ${command} ${args.join(' ')}`);
        return PythonShell.run(
            `${command}.py`, {
            parser(data) { outputChannel.appendLine(data); return data; },
            stderrParser(data) { outputChannel.appendLine(data); return data; },
            mode: 'text', encoding: 'utf8', scriptPath, cwd, args,
        });
    };

    const ctl = new GNURadioController(context.extensionUri,
        context.extension.packageJSON.displayName, cwd);

    context.subscriptions.push(
        ctl,
        vscode.commands.registerCommand(
            `${extId}.createModule`,
            () => modtool.createModule(outputChannel, scriptPath)),
    );

    if (!cwd) {
        return;
    }
    // Detect OOT module in the current working directory
    const moduleName: string = (await modtool.getModuleInfo(execModtool, true))?.modname;
    if (!moduleName) {
        const noModule = () => vscode.window.showErrorMessage("No GNURadio Module detected in the open workspace");
        context.subscriptions.push(vscode.commands.registerCommand(`${extId}.getModuleInfo`, noModule));
        return;
    }
    vscode.commands.executeCommand('setContext', `${extId}.moduleFound`, true);
    ctl.moduleName = moduleName;

    // Command Palette
    context.subscriptions.push(
        vscode.commands.registerCommand(
            `${extId}.getModuleInfo`,
            () => modtool.getModuleInfo(execModtool)),
        vscode.commands.registerCommand(
            `${extId}.createBlock`,
            () => modtool.createBlock(execModtool, context.extensionUri, cwd, moduleName)),
        vscode.commands.registerCommand(
            `${extId}.createPythonBindings`,
            () => modtool.createPythonBindings(execModtool, cwd, moduleName)),
        vscode.commands.registerCommand(
            `${extId}.${ctl.renameBlock.name}`,
            ctl.renameBlock,
            ctl),
        vscode.commands.registerCommand(
            `${extId}.${ctl.disableBlock.name}`,
            ctl.disableBlock,
            ctl),
        vscode.commands.registerCommand(
            `${extId}.${ctl.removeBlock.name}`,
            ctl.removeBlock,
            ctl),
        vscode.commands.registerCommand(
            `${extId}.convertXmlToYaml`,
            () => modtool.convertXmlToYaml(execModtool, cwd, moduleName)),
        vscode.commands.registerCommand(
            `${extId}.makeYamlFromImpl`,
            () => modtool.makeYamlFromImpl(execModtool, cwd, moduleName)),
    );

    // File Explorer Context Menu
    context.subscriptions.push(
        vscode.commands.registerCommand(
            `${extId}.createPythonBindingsInExplorer`,
            (blockUri: vscode.Uri) => {
                if (!blockUri) {
                    vscode.window.showErrorMessage('No file provided!');
                    return;
                }
                if (!blocks.filterCppBlocks(blockUri.fsPath)) {
                    vscode.window.showErrorMessage(`Invalid file type: expected a header (.h), found ${basename(blockUri.fsPath)}`);
                }
                const blockName = blocks.mapCppBlocks(blockUri.fsPath);
                return modtool.createPythonBindings(execModtool, cwd, moduleName, blockName);
            }),
        vscode.commands.registerCommand(
            `${extId}.convertXmlToYamlInExplorer`,
            (blockUri: vscode.Uri) => {
                if (!blockUri) {
                    return vscode.window.showErrorMessage('No file provided!');
                }
                if (!blocks.filterXmlBlocks(blockUri.fsPath)) {
                    return vscode.window.showErrorMessage(`Invalid file type: expected XML, found ${basename(blockUri.fsPath)}`);
                }
                const blockName = blocks.mapGrcBlocks('.xml')(blockUri.fsPath);
                return modtool.convertXmlToYaml(execModtool, cwd, moduleName, blockName);
            }),
        vscode.commands.registerCommand(
            `${extId}.makeYamlFromImplInExplorer`,
            (blockUri: vscode.Uri) => {
                if (!blockUri) {
                    return vscode.window.showErrorMessage('No file provided!');
                }
                if (!blocks.filterCppBlockImpl(blockUri.fsPath)) {
                    return vscode.window.showErrorMessage(`Invalid file type: expected C++ source, found ${basename(blockUri.fsPath)}`);
                }
                const blockName = blocks.mapCppBlockImpl(blockUri.fsPath);
                return modtool.makeYamlFromImpl(execModtool, cwd, moduleName, blockName);
            }),
    );

    /**
     * Check for old XML block definitions in the OOT module.
     * 
     * If any are found, asks if the user wants to update them to YAML.
     */
    const checkXml = async () => {
        const xmlBlocks = blocks.getXmlBlocks(cwd, moduleName);
        vscode.commands.executeCommand('setContext', `${extId}.xmlFound`, xmlBlocks.length > 0);
        if (!xmlBlocks.length) {
            return;
        }
        const yes = vscode.l10n.t("Yes"), no = vscode.l10n.t("No"), dontShowAgain = vscode.l10n.t("Don't Show Again");
        let updateAll = await vscode.window.showInformationMessage(
            'XML block definitions found. Update them to YAML?', yes, no, dontShowAgain);
        if (updateAll === 'Yes') {
            await ctl.execModtool('update', '--complete');
            vscode.commands.executeCommand('setContext', `${extId}.xmlFound`, false);
            updateAll = await vscode.window.showInformationMessage(
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
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('gnuradio-integration.modtool.checkXml') &&
                getConfig<boolean>('modtool.checkXml') === true) {
                checkXml();
            }
        }),
    );

    const moduleTree = new GNURadioModuleTreeDataProvider(cwd, moduleName);

    const registerTreeItemAlias = (alias: string, command: string) =>
        vscode.commands.registerCommand(
            `${extId}.${alias}`,
            (item?: vscode.TreeItem) => {
                if (!item) {
                    if (!moduleTree.treeView.selection.length) {
                        return;
                    }
                    item = moduleTree.treeView.selection[0];
                }
                if (!item.resourceUri) {
                    return;
                }
                return vscode.commands.executeCommand(
                    command, item.resourceUri,
                );
            });

    const getBlockFromTreeItem = (item?: vscode.TreeItem) => {
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
        vscode.commands.registerCommand(
            `${extId}.refreshView`,
            moduleTree.refresh,
            moduleTree),
        vscode.commands.registerCommand(
            `${extId}.createPythonBindingsInTree`,
            (item?: vscode.TreeItem) => {
                const blockName = getBlockFromTreeItem(item);
                return modtool.createPythonBindings(execModtool, cwd, moduleName, blockName);
            }),
        vscode.commands.registerCommand(
            `${extId}.convertXmlToYamlInTree`,
            (item?: vscode.TreeItem) => {
                const blockName = getBlockFromTreeItem(item);
                return modtool.convertXmlToYaml(execModtool, cwd, moduleName, blockName);
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
