import * as vscode from 'vscode';
import { GNURadioController } from './controller';

export function activate(context: vscode.ExtensionContext) {
    const ctl = new GNURadioController(context);

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
    );
}

export function deactivate() { }
