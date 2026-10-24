#!/usr/bin/env python3
"""Run Python, JavaScript and CSS checks; rebuild test inputs without creating a ZIP."""
import argparse
import contextlib
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import build
from build import bundles, compile_config, merge, read_map, render

ROOT = build.ROOT


class BuildTests(unittest.TestCase):
    def test_builder_calls_test_script_without_rebuilding(self):
        with patch.object(build.subprocess, "run") as run:
            build.run_tests()
        run.assert_called_once_with(
            [sys.executable, str(ROOT / "test.py"), "--no-build"], cwd=ROOT, check=True)

    def test_failed_tests_prevent_archive_and_remove_stale_zip(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "dist/logseq-config.zip"
            target.parent.mkdir()
            target.write_bytes(b"stale")
            with patch.object(build, "ROOT", root), patch.object(build, "bundles", return_value={}), \
                 patch.object(build, "run_tests", side_effect=subprocess.CalledProcessError(1, "node")), \
                 patch.object(build, "archive") as archive, patch.object(sys, "argv", ["build.py"]):
                with self.assertRaises(subprocess.CalledProcessError):
                    build.main()
                archive.assert_not_called()
            self.assertFalse(target.exists())

    def test_invalid_input_removes_stale_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "dist/logseq-config.zip"
            target.parent.mkdir()
            target.write_bytes(b"stale")
            with patch.object(build, "ROOT", root), \
                 patch.object(build, "bundles", side_effect=ValueError("Invalid config")), \
                 patch.object(sys, "argv", ["build.py"]):
                with self.assertRaises(ValueError):
                    build.main()
            self.assertFalse(target.exists())

    def test_generated_bundles_match_sources(self):
        for name, data in build.bundles().items():
            self.assertEqual((ROOT / "dist" / name).read_bytes(), data, name)

    def test_manifest_includes_every_source_once(self):
        import json
        manifest = json.loads((ROOT / "src/manifest.json").read_text())
        sources = [source for group in manifest.values() for source in group]
        self.assertEqual(len(sources), len(set(sources)))
        actual = {str(p.relative_to(ROOT)) for folder, ext in (("js", "js"), ("css", "css"), ("config", "edn"))
                  for p in (ROOT / "src" / folder).glob("*." + ext)}
        self.assertEqual(set(sources), actual)

    def test_archive_is_reproducible_and_contains_only_install_files(self):
        with tempfile.TemporaryDirectory() as directory:
            first, second = [Path(directory) / name for name in ("a.zip", "b.zip")]
            outputs = build.bundles()
            build.archive(first, outputs)
            build.archive(second, outputs)
            self.assertEqual(first.read_bytes(), second.read_bytes())
            with zipfile.ZipFile(first) as archive:
                self.assertIsNone(archive.testzip())
                self.assertEqual(set(archive.namelist()), {
                    "logseq/custom.js", "logseq/custom.css", "logseq/config.edn", "README.md", "LICENSE", "SHA256SUMS"})
                for name, data in outputs.items():
                    self.assertEqual(archive.read(name), data)
                for line in archive.read("SHA256SUMS").decode().splitlines():
                    digest, name = line.split("  ", 1)
                    self.assertEqual(hashlib.sha256(archive.read(name)).hexdigest(), digest)

    def test_cli_works_outside_repository(self):
        with tempfile.TemporaryDirectory() as directory:
            subprocess.run([sys.executable, str(ROOT / "build.py"), "--check"],
                           cwd=directory, check=True)

    def test_check_rejects_stale_bundle_without_overwriting_it(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "dist/logseq").mkdir(parents=True)
            target = root / "dist/logseq/custom.js"
            target.write_bytes(b"old")
            with patch.object(build, "ROOT", root), patch.object(build, "bundles", return_value={
                "logseq/custom.js": b"new"}), patch.object(sys, "argv", ["build.py", "--check"]), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as error:
                    build.main()
                self.assertEqual(error.exception.code, 1)
            self.assertEqual(target.read_bytes(), b"old")


class ConfigTests(unittest.TestCase):
    def test_many_config_layers_use_last_value_and_preserve_other_keys(self):
        result = read_map(compile_config(
            '{:device {:a 1 :b 2} :items [1]}',
            '{:device {:a 3} :items [2]}',
            '{:device {:b 4} :items []}',
        ).decode())
        self.assertEqual(result, read_map('{:device {:a 3 :b 4} :items []}'))

    def test_manifest_controls_config_order(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "src").mkdir()
            manifest = {"logseq/custom.js": ["src/a.js"],
                        "logseq/custom.css": ["src/a.css"],
                        "logseq/config.edn": ["src/first.edn", "src/second.edn", "src/third.edn"]}
            for name, value in {"a.js": "", "a.css": "", "first.edn": "{:x 1}",
                                "second.edn": "{:x 2 :y true}", "third.edn": "{:x 3}"}.items():
                (root / "src" / name).write_text(value)
            path = root / "src/manifest.json"
            path.write_text(json.dumps(manifest))
            with patch.object(build, "ROOT", root):
                self.assertEqual(read_map(bundles()["logseq/config.edn"].decode()),
                                 read_map("{:x 3 :y true}"))
                manifest["logseq/config.edn"].reverse()
                path.write_text(json.dumps(manifest))
                self.assertEqual(read_map(bundles()["logseq/config.edn"].decode()),
                                 read_map("{:x 1 :y true}"))

    def test_deep_merge_and_replacement(self):
        base = read_map('{:device {:a true :b 2} :items [1 2] :tags #{:a} :other "kept"}')
        overrides = read_map('{:device {:a false} :items [] :tags #{:b} :new nil}')
        self.assertEqual(merge(base, overrides), read_map(
            '{:device {:a false :b 2} :items [] :tags #{:b} :other "kept" :new nil}'))

    def test_empty_maps_merge_and_scalars_can_replace_maps(self):
        self.assertEqual(merge(read_map('{:a {:b 1}}'), read_map('{:a {}}')),
                         read_map('{:a {:b 1}}'))
        self.assertEqual(merge(read_map('{:a {:b 1}}'), read_map('{:a nil}')), {':a': 'nil'})

    def test_preserve_non_map_forms(self):
        source = '{:fn (fn [r] {:value (get r :x)}) :query [:find ?x] :pattern #"a.*"}'
        value = read_map(source)
        self.assertEqual(read_map(render(value)), value)
        self.assertEqual(value[':fn'], '(fn [r] {:value (get r :x)})')

    def test_comments_and_delimiters_in_strings(self):
        value = read_map('{; comment\n :a "a;{b}" , :b {"name" "value"}}')
        self.assertEqual(value[':a'], '"a;{b}"')
        self.assertEqual(read_map(render(value)), value)

    def test_invalid_inputs_fail(self):
        for source in ['{:a}', '{:a 1 :a 2}', '{:a [1}', '{} {}', '{:a #_ 1 2}', '{:a "broken}', '[]']:
            with self.subTest(source=source), self.assertRaises(ValueError):
                read_map(source)

    def test_real_config_roundtrip(self):
        base = (ROOT / 'src/config/default.edn').read_text()
        overrides = (ROOT / 'src/config/overrides.edn').read_text()
        result = read_map(compile_config(base, overrides).decode())
        self.assertEqual(result, merge(read_map(base), read_map(overrides)))
        self.assertEqual(result[':ui/enable-tooltip?'], 'false')
        self.assertEqual(result[':notes/mobile'][':contents-shortcut?'], 'true')
        self.assertIn(':journals', result[':default-queries'])


def run_python_tests():
    loader = unittest.defaultTestLoader
    suite = unittest.TestSuite(loader.loadTestsFromTestCase(case)
                               for case in (BuildTests, ConfigTests))
    if not unittest.TextTestRunner().run(suite).wasSuccessful():
        raise subprocess.CalledProcessError(1, "build.py self-tests")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-build", action="store_true", help="Test existing build outputs")
    args = parser.parse_args()
    if not args.no_build:
        subprocess.run([sys.executable, str(ROOT / "build.py"), "--build-only"],
                       cwd=ROOT, check=True)
    tests = sorted(str(path) for path in (ROOT / "tests").glob("*.test.cjs"))
    subprocess.run(["node", "--test", *tests], cwd=ROOT, check=True)
    run_python_tests()


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        sys.exit(error.returncode)
    except (OSError, ValueError) as error:
        sys.exit(f"Tests failed: {error}")
