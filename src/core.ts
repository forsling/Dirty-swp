import * as vscode from 'vscode';
import * as fs from "fs";
import * as path from "path";
import * as ds from './display';

const swpString: string = "VSCODE/" + vscode.env.machineId;
let DsDocs: DsDocArray = {};

class DsDocument {
    textDocument: vscode.TextDocument;
    basename: string;
    swapPath: string;
    hasOurSwp: boolean;
    forceLock: boolean;
    potentialUnsyncedChanges: boolean;
    removeOwnSwp: () => void;

    constructor(document: vscode.TextDocument) {
        let self = this;
        let filePath = document.uri.fsPath;
        let folder = path.dirname(filePath);
        let basename = path.basename(filePath);
    
        this.textDocument = document;
        this.basename = basename;
        this.swapPath = path.join(folder, "." + basename + ".swp");
        this.hasOurSwp = false;
        this.forceLock = false;

        //If the file has been in use by someone else while dirty,
        //then there may be unimported changes on disk that risk being overwritten
        this.potentialUnsyncedChanges = false;

        this.removeOwnSwp = function () {
            if (self.hasOurSwp) {
                fs.unlink(self.swapPath, (err) => {
                    if (err) {
                        vscode.window.showErrorMessage("Unable to remove own .swp: " + err);
                    }
                });
                self.hasOurSwp = false;
            }
        }
    }
}

interface DsDocArray {
	[key: string]: DsDocument;
}

class swpFile {
    data: string;
    swpType: string;
    swpId: null | string;
    swpUser: null | string;
    constructor(fileData: string) {
        this.data = fileData;
        this.swpType = "other";
        this.swpId = null;
        this.swpUser = null;
        if (fileData.length > 5 && fileData.startsWith("b0VIM")) {
            this.swpType = "vim";
            return;
        } else if (fileData.length < 6 || fileData.substring(0, 6) !== "VSCODE") {
            return;
        }
        let temp: string[] = fileData.split(":");
        this.swpType = "vscode";
        this.swpId = temp[0];
        if (temp.length > 1) {
            this.swpUser = temp[1];
        }
    }
}

const readFile = function(
    dpath: string, 
    callback: (err: NodeJS.ErrnoException | null, filestring: string, stats: fs.Stats | null) => void) {
        fs.stat(dpath, (err, stats) => {
            if (err) {
                callback(err, "", null);
                return;
            }
            fs.open(dpath, "r", (err, fd) => {
                if (err) {
                    callback(err, "", stats);
                    return;
                }
                var bsize = Math.min(1024, stats.size);
                var buffer = Buffer.alloc(bsize);
                fs.read(fd, buffer, 0, buffer.length, null, (err, bread, buffer) => {
                    if (err) {
                        callback(err, "", stats);
                        return;
                    }
                    var bstring = buffer.toString('utf8');
                    callback(null, bstring, stats);
                });

            });
        });
}

const checkSwp = function(
    dsDoc: DsDocument, 
    hasOthersSwpCallback: (swp: swpFile) => void, 
    noSwpCallback: () => void) {
        readFile(dsDoc.swapPath, (err, filestring, stats) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    noSwpCallback();
                } else {
                    vscode.window.showErrorMessage("Dirty.swp error: " + err.message)
                }
            } else {
                //Check if it isn't our swp after all, could be from a lost session
                let firstPart: string = filestring.split(":")[0];
                if (!err && firstPart === swpString) {
                    console.log("Reclaimed own .swp at " + dsDoc.swapPath);
                    dsDoc.hasOurSwp = true; 
                } else {
                    var swp = new swpFile(filestring);
                    hasOthersSwpCallback(swp);
                }
            }
        });
}

const lockFile = function(dsDoc: DsDocument, allowRetry = true) {
    //If the file is locked by us then editing is fine and nothing else needs to be done
    if (dsDoc.hasOurSwp) {
        return;
    }
    checkSwp(dsDoc, (swp) => {
        ds.warn(dsDoc, true, swp);
    }, () => {
        //If there is no current swp but the file is dirty we should lock it for ourselves
        fs.writeFile(dsDoc.swapPath, getFullSwpString(), { flag: "wx" }, (err) => {
            if (err) {
                if (allowRetry && err.code === "EEXIST") {
                    //Recurse once if a .swp file appeared just after we checked but before the write
                    lockFile(dsDoc, false);
                } else {
                    vscode.window.showErrorMessage("Writing .swp failed: " + err);
                }
            } else {
                dsDoc.hasOurSwp = true;
                console.log("Written swp: " + dsDoc.swapPath);
            }
        });
    });
}

const emptyDocs = function() {
    DsDocs = {};
}

const getFullSwpString = function() {
    let swpName: string = vscode.workspace.getConfiguration().get('dirtyswp.writeNameToSwp') || "";
    if (swpName) {
        return swpString + ":" + swpName;
    }
    return swpString;
}

export { 
    DsDocument, 
    DsDocArray, 
    DsDocs, 
    swpFile,
    swpString, 
    emptyDocs, 
    checkSwp, 
    lockFile 
};