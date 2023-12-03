'use strict';

import * as vscode from 'vscode';
import { promisify } from 'util';
import { ExecOptions, exec as cp_exec } from 'child_process';
import { dirname, extname, basename, resolve } from 'path';
import { existsSync, readdirSync } from 'fs';
const exec = promisify(cp_exec);

export class GNURadioController {
    private context: vscode.ExtensionContext;
    private _outputChannel: vscode.OutputChannel;
    private cwd?: string;
    private moduleName?: string;
    public readonly extId: string;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this._outputChannel = vscode.window.createOutputChannel(context.extension.packageJSON.displayName);
        this.extId = context.extension.packageJSON.name;

        const ws = vscode.workspace.workspaceFolders;
        if (!ws) {
            this.setCwd();
            return;
        }
        this.setCwd(ws[0].uri.fsPath);
        // } else if (ws.length > 1) {
        //     vscode.window.showErrorMessage("Multi-root workspace detected, what's the cwd?");
        //     return undefined;
        // }

        if (vscode.workspace.getConfiguration().get(`${this.extId}.modtool.checkXml`) === true) {
            this.checkXml();
        }
    }

    public setCwd(cwd?: string) {
        this.cwd = cwd;
        let moduleFound = false;
        if (cwd && basename(cwd).startsWith('gr-')) {
            moduleFound = true;
            this.moduleName = basename(cwd).slice(3);
        } else {
            this.moduleName = undefined;
        }
        vscode.commands.executeCommand('setContext', 'gnuradio-integration.moduleFound', moduleFound);
    }

    public async checkXml() {
        if (!this.cwd) {
            return;
        }
        const xmlBlocks = readdirSync(resolve(this.cwd!, 'grc'))
            .filter((filename) => extname(filename) === '.xml');
        vscode.commands.executeCommand('setContext', 'gnuradio-integration.xmlFound', xmlBlocks.length > 0);
        if (xmlBlocks.length > 0) {
            const updateAll = await vscode.window.showInformationMessage('XML block definitions found. Update them to YAML?', 'Yes', 'No');
            if (updateAll === 'Yes') {
                await this.exec(`${this.modtool()} update --complete`);
                vscode.window.showInformationMessage(`Block definitions written to "grc/". Checking for XML on startup can be disabled in extension settings.`);
                vscode.commands.executeCommand('setContext', 'gnuradio-integration.xmlFound', false);
            } else {
                vscode.window.showInformationMessage(`Checking for XML on startup can be disabled in extension settings.`);
            }
        }
    }

    private grc() {
        return vscode.workspace.getConfiguration().get(`${this.extId}.companion.cmd`);
    }

    private grcc() {
        return vscode.workspace.getConfiguration().get(`${this.extId}.compiler.cmd`);
    }

    private modtool() {
        return vscode.workspace.getConfiguration().get(`${this.extId}.modtool.cmd`);
    }

    private print(value: string) {
        this._outputChannel.appendLine(value);
    }

    private exec(cmd: string, options: ExecOptions & {
        successMessage?: string | undefined,
        stdoutPath?: string | undefined,
    } = {}) {
        if (!options.cwd) {
            options.cwd = this.cwd;
        }
        //this._outputChannel.show(true);
        this.print(`[Running] ${cmd}`);
        const proc = exec(cmd, options);
        proc.child.stdout?.on('data', (data) => this.print(`${data}`));
        proc.child.stderr?.on('data', (data) => this.print(`${data}`));
        if (options.successMessage) {
            proc.child.on('close', () => {
                this.print(`[Done] ${options.successMessage}`);
                vscode.window.showInformationMessage(options.successMessage!);
            });
        }
        proc.child.on('error', (err) => {
            this.print(`[Error] ${proc.child.stderr?.toString()}`);
            vscode.window.showErrorMessage(err.toString());
        });
        return proc;
    }

    private async execOnFile(cmd: string, fileUri?: vscode.Uri, options: ExecOptions & {
        successMessage?: string | undefined,
        stdoutPath?: string | undefined,
        fileExtension?: string | undefined,
    } = {}) {
        if (fileUri === undefined) {
            return vscode.window.showErrorMessage("File required");
        }
        let stat = await vscode.workspace.fs.stat(fileUri);
        switch (stat.type) {
            case vscode.FileType.File:
                break;
            case vscode.FileType.Directory:
                return vscode.window.showErrorMessage("File required, but folder was provided");
            case vscode.FileType.SymbolicLink:
                return vscode.window.showErrorMessage("File required, but symlink was provided");
            default:
                throw Error("File required, but something else was provided");
        }
        let path = fileUri.fsPath;
        if (options.fileExtension && extname(path) !== options.fileExtension) {
            // FIXME: Is this a sanity check?
            return vscode.window.showErrorMessage(`Expected file extension "${options.fileExtension}", but found "${extname(path)}"`);
        }
        if (!options.cwd) {
            options.cwd = dirname(path);
        }
        return this.exec(`${cmd} "${path}"`, options);
    }

    /** 
     * Open GNURadio Companion application.
     * 
     * This command runs `gnuradio-companion` in the shell.
     */
    public async openGnuradioCompanion() {
        return this.exec(`"${this.grc()}"`);
    }

    /** 
     * Edit the file in GNURadio Companion application.
     * 
     * This command runs `gnuradio-companion %f` in the shell, opening the selected file `%f`.
     */
    public async editInGnuradioCompanion(fileUri?: vscode.Uri) {
        return this.execOnFile(`"${this.grc()}"`, fileUri, { fileExtension: '.grc' });
    }

    /**
     * Compile the GRC flowgraph file.
     * 
     * This command runs `grcc %f` in the shell, producing a Python executable in the same folder as the selected file `%f`.
     */
    public async compileFlowgraph(fileUri?: vscode.Uri) {
        return this.execOnFile(`"${this.grcc()}"`, fileUri, { fileExtension: '.grc' });
    }

    /**
     * Run the GRC flowgraph file.
     * 
     * This command runs `grcc -r %f` in the shell, producing a Python executable in the same folder as the selected file `%f` and running it.
     */
    public async runFlowgraph(fileUri?: vscode.Uri) {
        return this.execOnFile(`"${this.grcc()}" -r`, fileUri, {
            successMessage: `Compiled to "${fileUri?.fsPath.replace(/".grc$"/, ".py")}" successfully`,
            fileExtension: '.grc',
        });
    }

    /**
     * Create a new OOT module project.
     * 
     * This command runs `gr_modtool newmod %name` in the shell, creating a new CMake project and opening the created folder. 
     */
    public async createModule() {
        try {
            const newmodName = await vscode.window.showInputBox({
                title: 'GNURadio: New OOT Module',
                placeHolder: 'Enter Module Name...',
                validateInput(value) {
                    let name = value.trim();
                    if (!name.length) {
                        return {
                            message: 'Name cannot be empty',
                            severity: vscode.InputBoxValidationSeverity.Error,
                        };
                    }
                    if (!/^([\w,\_,\-]+)$/.test(name)) {
                        return {
                            message: 'Name can only contain ASCII letters, digits, and the characters . - _',
                            severity: vscode.InputBoxValidationSeverity.Error,
                        };
                    }
                    if (name.length < 3) {
                        return {
                            message: 'Descriptive names usually contain at least 3 symbols',
                            severity: vscode.InputBoxValidationSeverity.Warning,
                            then: null,
                        };
                    }
                },
            });
            if (!newmodName) {
                throw Error('No valid name provided');
            }
            const parentDir = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                title: 'Create module in directory'
            }).then(
                (value) => value && value.length ? value[0].fsPath : undefined,
                () => undefined,
            );
            if (!parentDir) {
                throw Error('No directory provided');
            }
            const newmodPath = resolve(parentDir, `gr-${newmodName}`);
            if (existsSync(newmodPath)) {
                throw Error('Directory already exists');
            }
            await this.exec(`"${this.modtool()}" newmod ${newmodName}`, { cwd: parentDir });
            return vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(newmodPath));
        } catch (err) {
            if (err instanceof Error) {
                return vscode.window.showErrorMessage(err.message);
            }
        }
    }

    public async createPythonBindings(fileUri?: vscode.Uri) {
        try {
            let blockName: string | undefined;
            if (!fileUri) {
                const headers = readdirSync(resolve(this.cwd!, 'include', 'gnuradio', this.moduleName!))
                    .filter((filename) => extname(filename) === '.h' && basename(filename) !== 'api.h')
                    .map((filename) => filename.slice(0, -2));
                blockName = await vscode.window.showQuickPick(headers, {
                    title: 'GNURadio: Python Bindings',
                    placeHolder: 'Enter block name...',  // TODO: Regular expression (python-bridge?)
                    canPickMany: false,
                });
            } else if (extname(fileUri.fsPath) !== '.h') {
                throw Error(`Invalid file type: expected a header (.h), found ${extname(fileUri.fsPath)}`);
            } else {
                blockName = basename(fileUri.fsPath).slice(0, -2);
            }
            if (!blockName) {
                throw Error('No block name provided');
            }
            await this.exec(`"${this.modtool()}" bind ${blockName}`);
            return vscode.window.showInformationMessage(`Python bindings written to "python/${this.moduleName!}/bindings/${blockName}_python.cc"`);
        } catch (err) {
            if (err instanceof Error) {
                return vscode.window.showErrorMessage(err.message);
            }
        }
    }

    public async removeBlock(blockName?: string) {
        try {
            if (!blockName) {
                // TODO: Read CMakeLists.txt?
                const grcBlocks = readdirSync(resolve(this.cwd!, 'grc'))
                    .filter((filename) => extname(filename) === '.block.yml')
                    .map((filename) => filename.slice(this.moduleName!.length + 1, -10));
                const cppBlocks = readdirSync(resolve(this.cwd!, 'include', 'gnuradio', this.moduleName!))
                    .filter((filename) => extname(filename) === '.h' && basename(filename) !== 'api.h')
                    .map((filename) => filename.slice(0, -2));
                const pyBlocks = readdirSync(resolve(this.cwd!, 'python', this.moduleName!))
                    .filter((filename) => extname(filename) === '.py' && basename(filename) !== '__init__.py')
                    .map((filename) => filename.slice(0, -3));
                const blocks = Array.from(new Set([...grcBlocks, ...cppBlocks, ...pyBlocks]));
                blockName = await vscode.window.showQuickPick(blocks, {
                    title: 'GNURadio: Remove Block',
                    placeHolder: 'Enter block name...',
                    canPickMany: false,
                });
            }
            if (!blockName) {
                throw Error('No block name provided');
            }
            // TODO: show files to remove?
            const confirm = await vscode.window.showWarningMessage(`Are you sure you want to remove "${blockName}"?`, { modal: true }, "Yes");
            if (confirm === 'Yes') {
                await this.exec(`"${this.modtool()}" rm ${blockName} -y`);
                return vscode.window.showInformationMessage(`Block "${blockName}" was removed`);
            }
        } catch (err) {
            if (err instanceof Error) {
                return vscode.window.showErrorMessage(err.message);
            }
        }
    }

    public async convertXmlToYaml(fileUri?: vscode.Uri) {
        try {
            const modNameLength = this.moduleName!.length + 1;
            let blockName: string | undefined;
            if (!fileUri) {
                const xmlBlocks = readdirSync(resolve(this.cwd!, 'grc'))
                    .filter((filename) => extname(filename) === '.xml')
                    .map((filename) => filename.slice(modNameLength, -4));
                if (xmlBlocks.length === 0) {
                    return vscode.window.showInformationMessage('No XML found, no need to update!');
                }
                blockName = await vscode.window.showQuickPick(xmlBlocks, {
                    title: 'GNURadio: Convert XML to YAML',
                    placeHolder: 'Enter block name...',
                    canPickMany: false,
                });
            } else if (extname(fileUri.fsPath) !== '.xml') {
                throw Error(`Invalid file type: expected XML, found ${extname(fileUri.fsPath)}`);
            } else {
                blockName = basename(fileUri.fsPath).slice(modNameLength, -4);
            }
            if (!blockName) {
                const updateAll = await vscode.window.showWarningMessage('No block name provided! Update all definitions?', 'Yes', 'No');
                if (updateAll === 'Yes') {
                    await this.exec(`${this.modtool()} update --complete`);
                    return vscode.window.showInformationMessage(`Block definitions written to "grc/"`);
                }
                return;
            }
            await this.exec(`"${this.modtool()}" update ${blockName}`);
            return vscode.window.showInformationMessage(`Block definition written to "grc/${this.moduleName!}_${blockName}.block.yml"`);
        } catch (err) {
            if (err instanceof Error) {
                return vscode.window.showErrorMessage(err.message);
            }
        }
    }
}