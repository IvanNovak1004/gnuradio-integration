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
    if (!fileUri) {
        fileUri = vscode.window.activeTextEditor?.document.uri;
        // TODO: file picker?
        if (!fileUri) {
            throw URIError("File required");
        }
    }
    let stat = await vscode.workspace.fs.stat(fileUri);
    switch (stat.type) {
        case vscode.FileType.File:
            break;
        case vscode.FileType.Directory:
            throw URIError("File required, but folder was provided");
        case vscode.FileType.SymbolicLink:
            throw URIError("File required, but symlink was provided");
        default:
            throw URIError("File required, but something else was provided");
    }
    let path = fileUri.fsPath;
    if (fileExtension && extname(path) !== fileExtension) {
        throw URIError(`Expected file extension "${fileExtension}", but found "${extname(path)}"`);
    }
    return exec(`${cmd} "${path}"`, dirname(path));
}
