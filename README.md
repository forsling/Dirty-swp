# Dirty.swp

.swp file locking and detection

This extension is beta, use with caution!

Dirty.swp helps editing in shared environments by locking files you are edting by creating .swp files (like Vim). 
The extension also detects and warns you if anyone else is editing the files you open or are editing yourself. 
By default any dirty file will be locked but you have the ability to lock files until you close them.

## Commands
Dirty.swp has four commands:

* __Start__ Start monitoring and dirty file locking
* __Pause__ Stop monitoring and dirty file locking (will also release all current locks)
* __Lock file until close__ Lock the current file until close (instead of only while dirty)
* __List locked files__ Opens a menu that lists all .swp locked files that the extension knows about and shows their status

Whether Dirty.swp starts active or paused can be toggled in the settings.

## Status bar
By default Dirty.swp comes with a status bar item (label: .swp) in the bottom left that opens the Dirty.swp menu (List locked files command).
The status bar item can be disabled in settings.