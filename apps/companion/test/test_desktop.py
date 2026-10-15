import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("vaos_python_worker", Path(__file__).resolve().parent.parent / "python_worker.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class DesktopContract(unittest.TestCase):
    def test_focus_change_stops_remaining_characters(self):
        typed = []
        window = types.SimpleNamespace(title="Own test window", activate=lambda: None)
        titles = iter(["Own test window", "Own test window", "Other window"])
        device = types.SimpleNamespace(getWindowsWithTitle=lambda title: [window],
            getActiveWindowTitle=lambda: next(titles), write=lambda character, **kwargs: typed.append(character))
        with patch.dict(sys.modules, {"pyautogui": device}):
            with self.assertRaisesRegex(ValueError, "DESKTOP_FOCUS_CHANGED_PARTIAL"):
                worker.execute({"kind": "desktop.action", "input": {
                    "action": "type", "targetTitle": "Own test window", "text": "abc"}})
        self.assertEqual(typed, ["a"])

    def test_duplicate_exact_windows_are_not_selected(self):
        window = types.SimpleNamespace(title="Duplicate", activate=lambda: self.fail("Ambiguous window must not activate"))
        device = types.SimpleNamespace(getWindowsWithTitle=lambda title: [window, window])
        with patch.dict(sys.modules, {"pyautogui": device}):
            with self.assertRaisesRegex(ValueError, "DESKTOP_WINDOW_CHANGED"):
                worker.execute({"kind": "desktop.action", "input": {
                    "action": "type", "targetTitle": "Duplicate", "text": "abc"}})

    def test_control_characters_are_never_typed(self):
        window = types.SimpleNamespace(title="Target", activate=lambda: None)
        device = types.SimpleNamespace(getWindowsWithTitle=lambda title: [window],
            getActiveWindowTitle=lambda: "Target", write=lambda *args, **kwargs: self.fail("No input expected"))
        with patch.dict(sys.modules, {"pyautogui": device}):
            with self.assertRaisesRegex(ValueError, "DESKTOP_TEXT_INVALID"):
                worker.execute({"kind": "desktop.action", "input": {
                    "action": "type", "targetTitle": "Target", "text": "command\n"}})


if __name__ == "__main__":
    unittest.main()
