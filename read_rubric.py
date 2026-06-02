try:
    from PyPDF2 import PdfReader
except ImportError:
    import subprocess, sys
    subprocess.run([sys.executable, '-m', 'pip', 'install', 'pypdf2', '-q'])
    from PyPDF2 import PdfReader

r = PdfReader(r'C:\Users\Owner\Desktop\mcraesocial\mcrae-submit\Grade10_RVSWritingAssessmentRubric.pdf')
for i, page in enumerate(r.pages):
    print(f'--- Page {i+1} ---')
    print(page.extract_text())
