#!/usr/bin/env python3
"""
Pretendard Variable 을 unicode-range 청크로 쪼갠다(동적 서브셋).

왜: 원본은 한글 완성형 11,172자를 모두 담아 2,010 KB 다. 4G 실측에서 전송에만 11.7초가
걸렸고 그동안 본문은 폴백 폰트로 보이다가 리플로우됐다. unicode-range 로 쪼개 두면
브라우저가 **그 화면에 실제로 쓰인 글자가 든 청크만** 받는다. 글리프 손실은 없다 —
드물게 쓰이는 글자도 필요해지는 순간 해당 청크를 받는다(정적 서브셋과의 결정적 차이).

range 목록은 Pretendard 공식 dynamic-subset CSS 의 것을 그대로 쓴다. 사용 빈도순으로
묶여 있어 흔한 글자가 앞쪽 소수 청크에 몰린다 — 우리가 임의로 나누면 이 이점이 사라진다.
폰트 바이너리는 받지 않고 저장소의 원본에서 직접 생성한다.

재생성:  python3 scripts/gen-font-subset.py <공식-subset.css> 
필요:    pip install fonttools brotli
"""
import re, sys, subprocess, pathlib, shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'app/fonts/PretendardVariable.woff2'
# 경로에 버전을 박는다 — 폰트를 갱신해도 URL 이 바뀌어 immutable 캐시가 스스로 무효화된다.
VERSION = 'v1.3.9'
OUT = ROOT / 'public/fonts/pretendard' / VERSION
CSS_OUT = ROOT / 'app/fonts/pretendard.css'
PUBLIC_PREFIX = f'/fonts/pretendard/{VERSION}'

def parse_ranges(css_text):
    """공식 CSS 에서 (인덱스, unicode-range) 를 순서대로 뽑는다."""
    out = []
    for m in re.finditer(r'/\*\s*\[(\d+)\]\s*\*/.*?unicode-range:\s*([^;]+);', css_text, re.S):
        out.append((int(m.group(1)), ' '.join(m.group(2).split())))
        
    if not out:
        sys.exit('unicode-range 를 찾지 못했다 — 입력 CSS 형식을 확인할 것')
    return out

def codepoints(rng):
    """'U+ac00-d7a3, U+ff03' → 코드포인트 집합. 커버리지 검증용."""
    s = set()
    for part in rng.split(','):
        part = part.strip().removeprefix('U+')
        if '-' in part:
            a, b = part.split('-'); s.update(range(int(a, 16), int(b, 16) + 1))
        else:
            s.add(int(part, 16))
    return s

def main():
    if len(sys.argv) < 2:
        sys.exit('사용법: gen-font-subset.py <pretendard 공식 dynamic-subset.css>')
    ranges = parse_ranges(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))

    from fontTools.ttLib import TTFont
    src_font = TTFont(SRC)
    cmap = set(src_font.getBestCmap().keys())

    # woff2 를 92번 풀어내면 10분이 넘는다. 한 번만 풀어 ttf 로 두고 그걸 재사용한다.
    import tempfile
    tmp = pathlib.Path(tempfile.mkdtemp()) / 'PretendardVariable.ttf'
    src_font.flavor = None
    src_font.save(tmp)
    src_font.close()

    # 커버리지 검증 — range 합집합이 원본 cmap 을 덮지 못하면 그 글자는 화면에서 사라진다.
    covered = set()
    for _, rng in ranges:
        covered |= codepoints(rng)
    missing = sorted(cmap - covered)
    if missing:
        print(f'⚠️  range 미포함 코드포인트 {len(missing)}개 → 마지막 청크로 몰아넣는다')

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    faces, total = [], 0
    for idx, rng in ranges:
        dst = OUT / f'PretendardVariable.subset.{idx}.woff2'
        subprocess.run([
            'pyftsubset', str(tmp),
            f'--unicodes={rng.replace(" ", "")}',
            '--flavor=woff2', f'--output-file={dst}',
        ], check=True)
        total += dst.stat().st_size
        faces.append((idx, rng, dst.name))

    # 어느 range 에도 없는 글자를 담는 보충 청크. 없으면 원본에 있던 글자가 조용히 사라진다.
    #
    # 한 덩어리로 두면 안 된다: 실측에서 이 보충분이 210 KB 였고, 라틴확장·IPA·사용자영역처럼
    # 드문 글자뿐이라도 그중 한 글자가 화면에 나오는 순간 210 KB 를 통째로 받게 된다.
    # 코드포인트 오름차순으로 잘라 나누면 유니코드 블록 경계와 대체로 맞아떨어져,
    # 실제로 쓰인 블록만 받는다.
    CHUNK = 300
    for i in range(0, len(missing), CHUNK):
        group = missing[i:i + CHUNK]
        idx = max(i2 for i2, _, _ in faces) + 1
        rng = ', '.join(f'U+{c:04x}' for c in group)
        dst = OUT / f'PretendardVariable.subset.{idx}.woff2'
        subprocess.run([
            'pyftsubset', str(tmp),
            '--unicodes=' + ','.join(f'U+{c:04x}' for c in group),
            '--flavor=woff2', f'--output-file={dst}',
        ], check=True)
        total += dst.stat().st_size
        faces.append((idx, rng, dst.name))

    lines = [
        '/* 자동 생성 — 직접 고치지 말 것. scripts/gen-font-subset.py 로 재생성한다.',
        ' *',
        ' * Pretendard (c) 2021 Kil Hyung-jin — SIL Open Font License 1.1',
        ' * https://github.com/orioncactus/pretendard',
        ' *',
        ' * unicode-range 동적 서브셋: 브라우저가 화면에 실제로 쓰인 글자가 든 청크만 받는다.',
        ' * format 은 woff2-variations 가 아니라 woff2 를 쓴다 — 인식 못 하는 브라우저가',
        ' * src 를 통째로 건너뛰는 사고를 피하기 위해서다(가변 폰트도 woff2 로 정상 동작).',
        ' */',
        ':root { --font-pretendard: "Pretendard Variable"; }',
        '',
    ]
    for idx, rng, name in faces:
        lines += [
            f'/* [{idx}] */',
            '@font-face {',
            '  font-family: "Pretendard Variable";',
            '  font-style: normal;',
            '  font-display: swap;',
            '  font-weight: 45 920;',
            f'  src: url("{PUBLIC_PREFIX}/{name}") format("woff2");',
            f'  unicode-range: {rng};',
            '}',
            '',
        ]
    CSS_OUT.write_text('\n'.join(lines), encoding='utf-8')

    print(f'청크 {len(faces)}개, 합계 {total/1024:.0f} KB (원본 {SRC.stat().st_size/1024:.0f} KB)')
    print(f'CSS  → {CSS_OUT.relative_to(ROOT)}')
    print(f'폰트 → {OUT.relative_to(ROOT)}/')

main()
