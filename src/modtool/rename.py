#
# Copyright 2018 Free Software Foundation, Inc.
#
# This file is part of GNU Radio
#
# SPDX-License-Identifier: GPL-3.0-or-later
#
#
""" Module to rename blocks """

# Disallow running this script as a module
if __name__ != '__main__':
    exit(2)

from sys import stderr
from gnuradio.modtool.core import validate_name, ModToolRename, ModToolException
from argparse import ArgumentParser

argparser = ArgumentParser('gr_modtool rename')
argparser.add_argument('blockname', type=str)
argparser.add_argument('new_name', type=str)
args = argparser.parse_args()

try:
    tool = ModToolRename(args.blockname,
                         args.new_name)
    validate_name('block', tool.info['newname'])
    tool.run()
except ModToolException as e:
    print(e, file=stderr)
    exit(1)
