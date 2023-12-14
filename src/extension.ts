'use strict';

import * as vscode from 'vscode';
import { GNURadioController } from './controller';
import { exec, execOnFile } from './shellTask';
import { GNURadioModuleTreeDataProvider } from './moduleTree';
import { getXmlBlocks } from './blockFilter';

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

    const ctl = new GNURadioController(context.extensionUri,
        context.extension.packageJSON.displayName, cwd);

    context.subscriptions.push(
        ctl,
        vscode.commands.registerCommand(
            `${extId}.${ctl.createModule.name}`,
            ctl.createModule,
            ctl),
        vscode.commands.registerCommand(
            `${extId}.${ctl.getModuleInfo.name}`,
            ctl.getModuleInfo,
            ctl),
        vscode.commands.registerCommand(
            `${extId}.${ctl.createBlock.name}`,
            ctl.createBlock,
            ctl),
        vscode.commands.registerCommand(
            `${extId}.${ctl.createPythonBindings.name}`,
            ctl.createPythonBindings,
            ctl),
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
            `${extId}.${ctl.convertXmlToYaml.name}`,
            ctl.convertXmlToYaml,
            ctl),
        vscode.commands.registerCommand(
            `${extId}.${ctl.makeYamlFromImpl.name}`,
            ctl.makeYamlFromImpl,
            ctl),
    );

    if (!cwd) {
        return;
    }

    // Detect OOT module in the current working directory
    const moduleName: string = (await ctl.getModuleInfo(true))?.modname;
    if (!moduleName) {
        vscode.window.showInformationMessage('No GNURadio Module detected in the workspace');
        return;
    }
    vscode.commands.executeCommand('setContext', `${extId}.moduleFound`, true);
    ctl.moduleName = moduleName;

    /**
     * Check for old XML block definitions in the OOT module.
     * 
     * If any are found, asks if the user wants to update them to YAML.
     */
    const checkXml = async () => {
        const xmlBlocks = getXmlBlocks(cwd, moduleName);
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

    context.subscriptions.push(
        moduleTree,
        vscode.commands.registerCommand(
            `${extId}.refreshView`,
            moduleTree.refresh,
            moduleTree),
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
