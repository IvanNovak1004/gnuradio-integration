'use strict';

import * as vscode from 'vscode';

export class GNURadioController{
    private context:vscode.ExtensionContext;
    private cp = require('child_process');
    private fs = require('fs');
    private path = require('path');
    private _outputChannel: vscode.OutputChannel;

    constructor(context:vscode.ExtensionContext){
        this.context = context;
        this._outputChannel = vscode.window.createOutputChannel("gnuradio");
    }

    private initFolder(filePath:string, {isRelativeToScript = false} = {}) {
        const sep = this.path.sep;
        const folderPath = filePath.replace(/(.*[\\\/]).*$/, "$1").replace(/[\\\/]/g, sep);

        const initDir = this.path.isAbsolute(folderPath) ? sep : '';
        const baseDir = isRelativeToScript ? __dirname : '.';
        folderPath.split(sep).reduce((parentDir:string, childDir:string) => {
            const curDir = this.path.resolve(baseDir, parentDir, childDir);
            try {
                if(!this.fs.existsSync(curDir)){
                    this.fs.mkdirSync(curDir);
                    this._outputChannel.appendLine(`[Info] Directory "${curDir}" created.`);
                }
            } catch (err: any) {
                if (err.code !== 'EEXIST') {
                    vscode.window.showErrorMessage(err.toString());
                    throw err;
                }
            }

            return curDir;
        }, initDir);
    }

    private exec(cmd: string, {successMessage="", stdoutPath="", cwd=""} = {}){
        //this._outputChannel.show(true);
        this._outputChannel.appendLine(`[Running] ${cmd}`);
        this.cp.exec(cmd,  {cwd: cwd}, (err:any, stdout:any, stderr:any) => {
            if(stdout && stdoutPath){
                this.initFolder(stdoutPath);
                this.fs.writeFileSync(stdoutPath, stdout, 'utf8');
            }
            if(!err){
                if(stdout){
                    this._outputChannel.appendLine(`${stdout.toString()}`);
                }
                if(stderr){
                    this._outputChannel.appendLine(`${stderr.toString()}`);
                }
            }
            if (err) {
                this._outputChannel.appendLine(`[Error] ${stderr.toString()}`);
                vscode.window.showErrorMessage(err.toString());
                throw err;
            } else if(successMessage !== ""){
                this._outputChannel.appendLine(`[Done] ${successMessage}`);
                vscode.window.showInformationMessage(successMessage);
            }
        });
    }

    /**
     * openGnuradioCompanion
     */
    public async openGnuradioCompanion(fileUri: vscode.Uri) {
        const grc = vscode.workspace.getConfiguration().get('gnuradio-integration.gnuradio-companion.cmd', "");
        if(!fileUri){
            var workspaceFolders = vscode.workspace.workspaceFolders;
            if(workspaceFolders){
                fileUri = workspaceFolders[0].uri;
            }
        }
        this.fs.lstat(fileUri.fsPath, (err:any, stats:any) => {
            if(err){
                return vscode.window.showErrorMessage(err);
            }
            let dirName = fileUri.fsPath;
            if(stats.isFile()){
                dirName = this.path.dirname(fileUri.fsPath);
            }
            this.exec(`"${grc}"`, {cwd:dirName});
        });
    }

    /**
     * editInGnuradioCompanion
     */
    public async editInGnuradioCompanion(fileUri: vscode.Uri) {
        const grc = vscode.workspace.getConfiguration().get('gnuradio-integration.gnuradio-companion.cmd', "");
        this.fs.lstat(fileUri.fsPath, (err:any, stats:any) => {
            if(err){
                return vscode.window.showErrorMessage(err);
            }
            let dirName = fileUri.fsPath;
            if(stats.isFile()){
                dirName = this.path.dirname(fileUri.fsPath);
            }
            this.exec(`"${grc}" "${fileUri.fsPath}"`, {cwd:dirName});
        });
    }

    /**
     * runFlowgraph
     */
    public async runFlowgraph(fileUri: vscode.Uri) {
        const grcc = vscode.workspace.getConfiguration().get('gnuradio-integration.grcc.cmd', "");
        this.fs.lstat(fileUri.fsPath, (err:any, stats:any) => {
            if(err){
                return vscode.window.showErrorMessage(err);
            }
            let dirName = fileUri.fsPath;
            if(stats.isFile()){
                dirName = this.path.dirname(fileUri.fsPath);
            }
            this.exec(`"${grcc}" -r "${fileUri.fsPath}"`, {cwd:dirName});
        });
    }

    /**
     * compileFlowgraph
     */
    public async compileFlowgraph(fileUri: vscode.Uri) {
        const grcc = vscode.workspace.getConfiguration().get('gnuradio-integration.grcc.cmd', "");

        this.fs.lstat(fileUri.fsPath, (err:any, stats:any) => {
            if(err){
                return vscode.window.showErrorMessage(err);
            }
            let dirName = fileUri.fsPath;
            if(stats.isFile()){
                dirName = this.path.dirname(fileUri.fsPath);
            }
            this.exec(`"${grcc}" "${fileUri.fsPath}"`, {
                successMessage:`Compiled to "${fileUri.fsPath.replace("grc","py")}" successfully`,
                cwd:dirName
            });
        });
    }
}