#!/bin/sh
# copy the generator source into the git checkout (outputs and previews stay out of git)
cd "$(dirname "$0")"
R=/home/claude/trenchwarfare-cs2
rm -rf $R/tools $R/src $R/test $R/docs
tar --exclude __pycache__ --exclude _run.mjs -cf - tools src test docs README.md NOTES.md sync_repo.sh | tar -xf - -C $R
