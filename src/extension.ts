'use strict';

import * as vscode from 'vscode';
import { GNURadioController } from './controller';

export function activate(context: vscode.ExtensionContext) {
    const ctl = new GNURadioController(context);

    vscode.workspace.onDidChangeWorkspaceFolders((e) => {
        if (e.added.length) {
            ctl.setCwd(e.added[0].uri.fsPath);
        } else if (e.removed.length) {
            ctl.setCwd();
        }
    });

    vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('gnuradio-integration.modtool.checkXml') &&
            vscode.workspace.getConfiguration().get('gnuradio-integration.modtool.checkXml') === true) {
            ctl.checkXml();
        }
    });

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
}

export function deactivate() { }
