#!/bin/zsh
# usage: d.sh '<json>'
curl -s -X POST http://127.0.0.1:9444/ -d "$1"
