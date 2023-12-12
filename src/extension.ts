'use strict';

import * as vscode from 'vscode';
import { GNURadioController } from './controller';

export function activate(context: vscode.ExtensionContext) {
    const ctl = new GNURadioController(context);

    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        ctl.setCwd(vscode.workspace.workspaceFolders[0].uri.fsPath);
    }

    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders((e) => {
            if (e.added.length) {
                ctl.setCwd(e.added[0].uri.fsPath);
            } else if (e.removed.length) {
                ctl.setCwd();
            }
        }),
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('gnuradio-integration.modtool.checkXml') &&
                vscode.workspace.getConfiguration().get('gnuradio-integration.modtool.checkXml') === true) {
                ctl.checkXml();
            }
        }),
        vscode.tasks.onDidEndTaskProcess(e => {
            if (e.execution.task.source === 'grc') {
                if (e.exitCode && e.exitCode !== 0) {
                    vscode.window.showErrorMessage(
                        `Compilation process finished with error code ${e.exitCode}; check the terminal output for details`);
                } else if (e.execution.task.detail?.startsWith('grcc')) {
                    // TODO: C++ flowgraph?
                    // TODO: read task parameters to find the compiled file
                    vscode.window.showInformationMessage('Flowgraph compilation was successfull');
                }
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            `${ctl.extId}.${ctl.openGnuradioCompanion.name}`,
            ctl.openGnuradioCompanion,
            ctl),
        vscode.commands.registerCommand(
            `${ctl.extId}.${ctl.editInGnuradioCompanion.name}`,
            ctl.editInGnuradioCompanion,
            ctl),
        vscode.commands.registerCommand(
            `${ctl.extId}.${ctl.runFlowgraph.name}`,
            ctl.runFlowgraph,
            ctl),
        vscode.commands.registerCommand(
            `${ctl.extId}.${ctl.compileFlowgraph.name}`,
            ctl.compileFlowgraph,
            ctl),
        vscode.commands.registerCommand(
            `${ctl.extId}.${ctl.createModule.name}`,
            ctl.createModule,
            ctl),
        vscode.commands.registerCommand(
            `${ctl.extId}.${ctl.getModuleInfo.name}`,
            ctl.getModuleInfo,
            ctl),
        vscode.commands.registerCommand(
            `${ctl.extId}.${ctl.createBlock.name}`,
            ctl.createBlock,
            ctl),
        vscode.commands.registerCommand(
            `${ctl.extId}.${ctl.createPythonBindings.name}`,
            ctl.createPythonBindings,
            ctl),
        vscode.commands.registerCommand(
            `${ctl.extId}.${ctl.renameBlock.name}`,
            ctl.renameBlock,
            ctl),
        vscode.commands.registerCommand(
            `${ctl.extId}.${ctl.disableBlock.name}`,
            ctl.disableBlock,
            ctl),
        vscode.commands.registerCommand(
            `${ctl.extId}.${ctl.removeBlock.name}`,
            ctl.removeBlock,
            ctl),
        vscode.commands.registerCommand(
            `${ctl.extId}.${ctl.convertXmlToYaml.name}`,
            ctl.convertXmlToYaml,
            ctl),
        vscode.commands.registerCommand(
            `${ctl.extId}.${ctl.makeYamlFromImpl.name}`,
            ctl.makeYamlFromImpl,
            ctl),
    );

    vscode.window.registerTreeDataProvider('gnuradioModule', ctl);

    const registerTreeItemAlias = (alias: string, command: string) =>
        vscode.commands.registerCommand(
            `${ctl.extId}.${alias}`,
            (item: vscode.TreeItem) => vscode.commands.executeCommand(
                command, item.resourceUri!,
            ));

    context.subscriptions.push(
        vscode.commands.registerCommand(
            `${ctl.extId}.refreshView`,
            ctl.refresh,
            ctl),
        // TODO: Collapse all?
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
