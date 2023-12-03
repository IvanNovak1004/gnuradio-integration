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
            `${ctl.extId}.${ctl.createPythonBindings.name}`,
            ctl.createPythonBindings,
            ctl),
    );
}

export function deactivate() { }
