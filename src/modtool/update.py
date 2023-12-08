#
# Copyright 2018 Free Software Foundation, Inc.
#
# This file is part of GNU Radio
#
# SPDX-License-Identifier: GPL-3.0-or-later
#
#
""" Module to convert XML bindings to YAML bindings """

# Disallow running this script as a module
if __name__ != '__main__':
    exit(2)

from sys import stderr
from gnuradio.modtool.core import ModToolUpdate, ModToolException
from argparse import ArgumentParser

argparser = ArgumentParser('gr_modtool update')
argparser.add_argument('blockname', type=str, default=None)
argparser.add_argument('--complete', action='store_true')
args = argparser.parse_args()

try:
    tool = ModToolUpdate(args.blockname,
                         complete=args.complete)
    if not tool.info['complete'] and (not tool.info['pattern'] or tool.info['pattern'].isspace()):
        raise ModToolException('Block name not specified!')
    tool.run()
except ModToolException as e:
    print(e, file=stderr)
    exit(1)
