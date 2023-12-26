import { dirname, extname, resolve } from 'path';
import * as vscode from 'vscode';

export function exec(
    cmd: string, options: {
        cwd?: string,
        // pythonInterp?: string,
        pythonpath?: string,
        gnuradioPrefix?: string,
    } = {}) {
    let env: { [key: string]: string } = {};
    if (options.pythonpath) {
        env['PYTHONPATH'] = options.pythonpath;
    }
    if (options.gnuradioPrefix) {
        env['GR_PREFIX'] = options.gnuradioPrefix;
        let command = cmd.split(' ');
        command[0] = resolve(options.gnuradioPrefix, 'bin', command[0]);
        cmd = command.join(' ');
    }
    return vscode.tasks.executeTask(new vscode.Task(
        { type: 'shell' },
        vscode.TaskScope.Workspace,
        'shell',
        'gnuradio',
        new vscode.ShellExecution(cmd, { cwd: options.cwd, env })
    ));
}

export async function execOnFile(
    cmd: string,
    fileUri?: vscode.Uri,
    options: {
        fileExtension?: string | undefined,
        pythonpath?: string,
        gnuradioPrefix?: string,
    } = {}) {
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
    if (options.fileExtension && extname(path) !== options.fileExtension) {
        throw URIError(`Expected file extension "${options.fileExtension}", but found "${extname(path)}"`);
    }
    return exec(`${cmd} "${path}"`, { cwd: dirname(path), ...options });
}

export function onEndTaskShellCommand(e: vscode.TaskProcessEndEvent) {
    if (e.execution.task.source !== 'gnuradio') {
        return;
    }
    if (e.exitCode && e.exitCode !== 0) {
        vscode.window.showErrorMessage(
            `Task finished with error code ${e.exitCode}; ` +
            'check the terminal output for details');
        return;
    }
    return e.execution.task.execution instanceof vscode.ShellExecution
        ? e.execution.task.execution.commandLine // .command
        : undefined;
}
