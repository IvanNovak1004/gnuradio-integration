import { OutputChannel, window } from 'vscode';
import { execSync, spawn } from 'child_process';
import { platform } from 'os';

export class PythonShellError extends Error {
    log?: string;
    exitCode?: number;

    constructor(message: string, log?: string, exitCode?: number) {
        super(message);
        this.name = 'PythonShellError';
        this.log = log;
        this.exitCode = exitCode;
        Object.setPrototypeOf(this, PythonShellError);
    }
}

export class PythonShell {
    constructor(
        readonly pythonPath: string,
        readonly scriptPath: string,
        readonly outputChannel: OutputChannel,
    ) {}

    public static default(scriptPath: string, displayName: string) {
        let pythonPath = 'python';
        if (platform() !== 'win32') {
            try {
                pythonPath = execSync(`command -v ${pythonPath}`, { encoding: 'utf8' });
            } catch (_) {
                pythonPath = 'python3';
            }
        }
        return new PythonShell(pythonPath, scriptPath, window.createOutputChannel(displayName));
    }

    run(command: string[], cwd?: string, encoding?: BufferEncoding) {
        return new Promise<string>((resolve, reject) => {
            const py = spawn(this.pythonPath, command, { cwd });
            py.stdout.setEncoding(encoding ?? 'utf8');
            py.stdout.on('data', (data: string) => this.outputChannel.appendLine(data));
            py.stderr.setEncoding(encoding ?? 'utf8');
            py.stderr.on('data', (data: string) => this.outputChannel.appendLine(data));
            py.on('error', err => reject(new PythonShellError(err.message, py.stdout.read())));
            py.on('exit', code => {
                if (!code || code === 0) {
                    resolve(py.stdout.read());
                } else {
                    reject(new PythonShellError(
                        `Script '${command.join(' ')}' exited with error code ${code}`,
                        py.stdout.read(), code));
                }
            });
        });
    }
}
