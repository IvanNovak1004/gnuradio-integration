'use strict';

import { dirname, extname } from 'path';
import * as vscode from 'vscode';

export function exec(cmd: string, cwd?: string) {
    return vscode.tasks.executeTask(new vscode.Task(
        { type: 'shell' },
        vscode.TaskScope.Workspace,
        'shell',
        'gnuradio',
        new vscode.ShellExecution(cmd, { cwd })
    ));
}

export async function execOnFile(cmd: string, fileUri?: vscode.Uri, fileExtension?: string | undefined) {
    try {
        if (!fileUri) {
            fileUri = vscode.window.activeTextEditor?.document.uri;
            // TODO: file picker?
            if (!fileUri) {
                throw Error("File required");
            }
        }
        let stat = await vscode.workspace.fs.stat(fileUri);
        switch (stat.type) {
            case vscode.FileType.File:
                break;
            case vscode.FileType.Directory:
                throw Error("File required, but folder was provided");
            case vscode.FileType.SymbolicLink:
                throw Error("File required, but symlink was provided");
            default:
                throw Error("File required, but something else was provided");
        }
        let path = fileUri.fsPath;
        if (fileExtension && extname(path) !== fileExtension) {
            throw Error(`Expected file extension "${fileExtension}", but found "${extname(path)}"`);
        }
        return exec(`${cmd} "${path}"`, dirname(path));
    } catch (err) {
        if (err instanceof Error) {
            vscode.window.showErrorMessage(err.message);
        }
    }
}
