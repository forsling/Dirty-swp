"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lockFile = exports.checkSwp = exports.emptyDocs = exports.swpString = exports.swpFile = exports.DsDocs = exports.DsDocument = void 0;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const swpString = "VSCODE/" + vscode.env.machineId;
exports.swpString = swpString;
let DsDocs = {};
exports.DsDocs = DsDocs;
class DsDocument {
    constructor(document) {
        this.lastCheck = null;
        this.lastEditWarning = null;
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
                    else {
                        console.log("Unlinked swp at: " + self.swapPath);
                    }
                });
                self.hasOurSwp = false;
            }
        };
    }
}
exports.DsDocument = DsDocument;
class swpFile {
    constructor(fileData) {
        this.data = fileData;
        this.swpType = "other";
        this.swpId = null;
        this.swpUser = null;
        if (fileData.length > 5 && fileData.startsWith("b0VIM")) {
            this.swpType = "vim";
            return;
        }
        else if (fileData.length < 6 || fileData.substring(0, 6) !== "VSCODE") {
            return;
        }
        let temp = fileData.split(":");
        this.swpType = "vscode";
        this.swpId = temp[0];
        if (temp.length > 1) {
            this.swpUser = temp[1];
        }
    }
}
exports.swpFile = swpFile;
const readFile = function (dpath, callback) {
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
            let bsize = Math.min(1024, stats.size);
            let buffer = Buffer.alloc(bsize);
            fs.read(fd, buffer, 0, buffer.length, null, (err, bread, buffer) => {
                fs.close(fd, (err) => {
                    if (err) {
                        console.error(err);
                    }
                });
                if (err) {
                    callback(err, "", stats);
                    return;
                }
                var bstring = buffer.toString('utf8');
                callback(null, bstring, stats);
            });
        });
    });
};
const checkSwp = function (dsDoc, hasOthersSwpCallback, noSwpCallback, allowRetry = true) {
    readFile(dsDoc.swapPath, (err, filestring, stats) => {
        if (err) {
            if (err.code === 'ENOENT') {
                noSwpCallback();
            }
            else if (err.code !== 'EPERM') {
                vscode.window.showErrorMessage("Dirty.swp error: " + err.message);
            }
        }
        else if (!filestring) {
            if (allowRetry) {
                console.log("Found empty swp file, checking again in 500ms in case a file is being created");
                setTimeout(() => {
                    checkSwp(dsDoc, hasOthersSwpCallback, noSwpCallback, false);
                }, 500);
            }
            else {
                console.log("Still empty .swp file. Considering this .swp invalid");
                noSwpCallback();
            }
        }
        else {
            //Check if it isn't our swp after all, could be from a lost session
            let firstPart = filestring.split(":")[0];
            console.log(`checkSwp found swp: ${firstPart}`);
            if (!err && firstPart === swpString) {
                if (!dsDoc.hasOurSwp) {
                    console.log("Reclaimed own .swp at " + dsDoc.swapPath);
                    dsDoc.hasOurSwp = true;
                }
            }
            else {
                var swp = new swpFile(filestring);
                hasOthersSwpCallback(swp);
            }
        }
    });
};
exports.checkSwp = checkSwp;
const lockFile = function (dsDoc, allowRetry = true) {
    console.log("Trying to lock file: " + dsDoc.basename);
    //If the file is locked by us then editing is fine and nothing else needs to be done
    if (dsDoc.hasOurSwp) {
        return;
    }
    //If there is no current swp but the file is dirty we should lock it for ourselves
    fs.writeFile(dsDoc.swapPath, getFullSwpString(), { flag: "wx" }, (err) => {
        if (dsDoc.hasOurSwp) {
            console.log("Document has our swp");
        }
        else if (err) {
            if (allowRetry && err.code === "EEXIST") {
                //Recurse once if a .swp file appeared just after we checked but before the write
                lockFile(dsDoc, false);
            }
            else {
                vscode.window.showErrorMessage("Writing .swp failed: " + err);
            }
        }
        else {
            dsDoc.hasOurSwp = true;
            console.log("Created swp at: " + dsDoc.swapPath);
        }
    });
};
exports.lockFile = lockFile;
const emptyDocs = function () {
    exports.DsDocs = DsDocs = {};
};
exports.emptyDocs = emptyDocs;
const getFullSwpString = function () {
    let swpName = vscode.workspace.getConfiguration().get('dirtyswp.writeNameToSwp') || "";
    if (swpName) {
        return swpString + ":" + swpName;
    }
    return swpString;
};
//# sourceMappingURL=core.js.map