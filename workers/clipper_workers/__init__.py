"""Python workers for the podcast clipper pipeline.

Every worker is run as `python -m clipper_workers.<name> --input ... --output ...` and speaks
JSON Lines on stdout (see clipper_workers.common.io). Human logs go to stderr.
"""
