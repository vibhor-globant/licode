#!/bin/bash

SCRIPT=`pwd`/$0
FILENAME=`basename $SCRIPT`
ROOT=`dirname $SCRIPT`
CURRENT_DIR=`pwd`

cd $ROOT/erizoAgent
pm2 start erizoAgent.js

cd $CURRENT_DIR
