#
# Copyright 2018 Free Software Foundation, Inc.
#
# This file is part of GNU Radio
#
# SPDX-License-Identifier: GPL-3.0-or-later
#
#
""" Create a whole new out-of-tree module """

# Disallow running this script as a module
if __name__ != '__main__':
    exit(2)

from sys import stderr
from gnuradio.modtool.core import validate_name, ModToolNewModule, ModToolException
from argparse import ArgumentParser

argparser = ArgumentParser('gr_modtool add')
argparser.add_argument('modname', type=str, default=None)
args = argparser.parse_args()

try:
    tool = ModToolNewModule(args.modname)
    validate_name('module', tool.info['modname'])
    tool.run()
except ModToolException as e:
    print(e, file=stderr)
    exit(1)
