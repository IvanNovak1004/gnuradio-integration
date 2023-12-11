#
# Copyright 2018 Free Software Foundation, Inc.
#
# This file is part of GNU Radio
#
# SPDX-License-Identifier: GPL-3.0-or-later
#
#
""" Module to add new blocks """

# Disallow running this script as a module
if __name__ != "__main__":
    exit(2)

from sys import stderr
from gnuradio.modtool.core import ModToolAdd, ModToolException
from argparse import ArgumentParser

argparser = ArgumentParser("gr_modtool add")
argparser.add_argument("blockname", type=str, default=None)
argparser.add_argument(
    "-t", "--block-type", type=str, help=f"One of {', '.join(ModToolAdd.block_types)}."
)
argparser.add_argument(
    "--license-file",
    type=str,
    default=None,
    help="File containing the license header for every source code file.",
)
argparser.add_argument(
    "--copyright",
    type=str,
    default=None,
    help="Name of the copyright holder (you or your company) MUST be a quoted string.",
)
argparser.add_argument(
    "--argument-list",
    type=str,
    default='""',
    help="The argument list for the constructor and make functions.",
)
argparser.add_argument(
    "--add-python-qa",
    action="store_true",
    help="If given, Python QA code is automatically added if possible.",
)
argparser.add_argument(
    "--add-cpp-qa",
    action="store_true",
    help="If given, C++ QA code is automatically added if possible.",
)
argparser.add_argument(
    "--skip-cmakefiles",
    action="store_true",
    help="If given, only source files are written, but CMakeLists.txt files are left unchanged.",
)
argparser.add_argument("-l", "--lang", type=str, help="Programming Language")
args = argparser.parse_args()

try:
    tool = ModToolAdd(
        args.blockname,
        block_type=args.block_type,
        lang=args.lang,
        copyright=args.copyright,
        license_file=args.license_file,
        argument_list=args.argument_list,
        add_cpp_qa=args.add_cpp_qa,
        add_python_qa=args.add_python_qa,
        skip_cmakefiles=args.skip_cmakefiles,
    )
    tool.run()
except ModToolException as e:
    print(e, file=stderr)
    exit(1)
