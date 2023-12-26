import { OutputChannel, window } from 'vscode';
import { execSync, spawn } from 'child_process';
import { EOL, platform } from 'os';
import { resolve } from 'path';
import { env } from 'process';

export class PythonShellError extends Error {
    log?: string;
    exitCode?: number;

    constructor(message: string, log?: string, exitCode?: number) {
        super(message);
        this.name = 'PythonShellError';
        this.log = log;
        this.exitCode = exitCode;
        Object.setPrototypeOf(this, PythonShellError.prototype);
    }
}

export function findPython(pythonInterp?: string) {
    const python = pythonInterp?.length ? pythonInterp : 'python';
    if (platform() === 'win32') {
        // TODO: check for Python executable
        return python;
    }
    try {
        return execSync(
            `command -v ${python}`,
            { encoding: 'utf8' }
        ).trim();
    } catch (_) {
        return 'python3';
    }
}

export function getPythonpath(pythonInterp: string, gnuradioPrefix?: string, defaultPythonpath?: string[]) {
    const pythonVersion = execSync(`${pythonInterp} --version`, { encoding: 'utf8' });
    if (!/Python 3\.\d+\.\d+/.test(pythonVersion)) {
        throw Error(`Unrecognized Python version: ${pythonVersion}`);
    }
    let pythonpath = defaultPythonpath ?? [];
    if (gnuradioPrefix?.length) {
        pythonpath.push(resolve(
            gnuradioPrefix, 'lib',
            `python3.${pythonVersion.split('.')[1]}`,
            'site-packages'));
    }
    if (env['PYTHONPATH']) {
        pythonpath.push(env['PYTHONPATH']);
    }
    return pythonpath.join(':');
}

export class PythonShell {
    constructor(
        readonly pythonPath: string,
        readonly scriptPath: string,
        readonly outputChannel: OutputChannel,
    ) { }

    public static default(scriptPath: string, displayName: string, pythonPath?: string) {
        pythonPath = findPython(pythonPath);
        return new PythonShell(pythonPath, scriptPath, window.createOutputChannel(displayName));
    }

    run(command: string[], cwd?: string, encoding?: BufferEncoding) {
        command[0] = resolve(this.scriptPath, command[0]);
        return new Promise<string>((resolve, reject) => {
            const py = spawn(this.pythonPath, command, { cwd });
            let stdout: string[] = [], stderr: string[] = [];
            py.stdout.setEncoding(encoding ?? 'utf8');
            py.stdout.on('data', (data: string) => {
                stdout.push(data);
                this.outputChannel.appendLine(data);
            });
            py.stderr.setEncoding(encoding ?? 'utf8');
            py.stderr.on('data', (data: string) => {
                stderr.push(data);
                this.outputChannel.appendLine(data);
            });
            py.on('error', err => reject(new PythonShellError(err.message, stderr.join(EOL))));
            py.on('exit', code => {
                if (!code || code === 0) {
                    resolve(stdout.join(EOL));
                } else {
                    reject(new PythonShellError(
                        `Script '${command.join(' ')}' exited with error code ${code}`,
                        stderr.join(EOL), code));
                }
            });
        });
    }
}
