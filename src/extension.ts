// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { GNURadioController } from './controller';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	const controller = new GNURadioController(context);

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json

    context.subscriptions.push(
        vscode.commands.registerCommand('gnuradio-integration.openGnuradioCompanion',
        (fileUri: vscode.Uri) => controller.openGnuradioCompanion(fileUri))
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('gnuradio-integration.editInGnuradioCompanion',
        (fileUri: vscode.Uri) => controller.editInGnuradioCompanion(fileUri))
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('gnuradio-integration.runFlowgraph',
        (fileUri: vscode.Uri) => controller.runFlowgraph(fileUri))
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('gnuradio-integration.compileFlowgraph',
        (fileUri: vscode.Uri) => controller.compileFlowgraph(fileUri))
    );
}

// this method is called when your extension is deactivated
export function deactivate() {}
