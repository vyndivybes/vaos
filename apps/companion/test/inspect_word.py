import json
import sys
from zipfile import ZipFile
from xml.etree import ElementTree
with ZipFile(sys.argv[1]) as archive:
    root = ElementTree.fromstring(archive.read("word/document.xml"))
    print(json.dumps({"text": " ".join(element.text or "" for element in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t"))}))
