import * as vscode from 'vscode';
import { GNURadioController } from './controller';

export function activate(context: vscode.ExtensionContext) {
    const ctl = new GNURadioController(context);

    context.subscriptions.push(
        vscode.commands.registerCommand(
            `${ctl.extId}.openGnuradioCompanion`,
            ctl.openGnuradioCompanion,
            ctl),
        vscode.commands.registerCommand(
            `${ctl.extId}.editInGnuradioCompanion`,
            ctl.editInGnuradioCompanion,
            ctl),
        vscode.commands.registerCommand(
            `${ctl.extId}.runFlowgraph`,
            ctl.runFlowgraph,
            ctl),
        vscode.commands.registerCommand(
            `${ctl.extId}.compileFlowgraph`,
            ctl.compileFlowgraph,
            ctl),
    );
}

export function deactivate() { }
