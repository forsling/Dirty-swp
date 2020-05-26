# Dirty.swp Changelog

## [0.9.5]
- Will now warn when changing active text document to locked file instead of just on open or edit
- Limited processing of .swp checking/locking logic on bursts of document changes
- Limited warnings for document changes to locked files (instead of at every keystroke)
- Fixed file descriptor not being closed when reading .swp files

## [0.9.4]
- Safer locking
- Better locked file warnings (distinguish between Vim .swp files, Dirty.swp with or without name, and other lock files)
- Max length for user name in warnings (no more than 20 characters of user name will be displayed)

## [0.9.3]
- Initial public release.
