# Puppeteer Test Runner - 프로젝트 스펙

## 개요

사용자가 작성한 테스트 루틴(`.md`)을 Claude CLI에 전달하고, Claude가 Puppeteer 코드를 생성한 뒤 별도로 실행하여 결과를 앱에서 조회할 수 있는 로컬 Electron 앱.

---

## 기술 스택

- **앱**: Electron
- **UI**: 순수 HTML / CSS / JS (Renderer Process), `marked` 라이브러리 (마크다운 렌더링)
- **로직**: Node.js (Main Process)
- **AI**: Claude CLI (`claude -p --dangerously-skip-permissions --chrome`)
- **자동화**: Puppeteer 21.x
- **저장**: 파일 기반 (루틴 `.md`, 결과 JSON, 스크린샷 PNG) + SQLite 인덱스 (`index.db`)
- **빌드**: electron-builder → `.exe`

---

## 디렉토리 구조

```
project/
├── main.js                  # Electron Main Process
├── preload.js               # IPC 브릿지 (contextBridge)
├── package.json
├── renderer/
│   ├── style.css            # 단일 고정 테마 (다크 사이드바 + 라이트 메인)
│   ├── skills.html          # 스킬 목록 & 보기 & 저장
│   ├── routines.html        # 루틴 목록 & 생성 & 삭제 (무한 스크롤)
│   ├── routine-detail.html  # 루틴 상세 (편집 / 미리보기 / 실행)
│   ├── results.html         # 결과 목록 (검색 + 무한 스크롤)
│   └── result-detail.html   # 결과 상세
├── skills/                  # 스킬 디렉토리
│   └── 스킬명/
│       └── SKILL.md
├── routines/                # .md 루틴 파일
├── test/                    # 생성된 Puppeteer 코드 (루틴명.js)
├── results/                 # 실행 결과 JSON
│   └── screenshots/         # 에러 스크린샷
└── index.db                 # SQLite 인덱스 (루틴명/결과 메타데이터)
```

---

## SQLite 인덱스 (`index.db`)

파일이 많아질 때 디렉토리 전체 스캔 없이 페이징/검색을 지원하기 위한 인덱서. 실제 데이터(루틴 내용, 결과 로그)는 파일에서 직접 읽는다.

### 테이블

```sql
CREATE TABLE routines (
  name       TEXT    PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE TABLE results (
  id           TEXT    PRIMARY KEY,
  file_path    TEXT    NOT NULL,   -- 결과 JSON 절대 경로
  routine_name TEXT    NOT NULL,
  status       TEXT    NOT NULL,   -- 'success' | 'fail'
  executed_at  INTEGER NOT NULL    -- Unix ms
);
```

### 마이그레이션

앱 최초 실행 시 기존 `routines/*.md`, `results/*.json` 파일을 스캔하여 DB에 자동 삽입 (`INSERT OR IGNORE`).

---

## 페이지 구조

### 1. `/skills` — 스킬 관리
- `skills/` 하위 디렉토리 목록 표시
- 각 스킬: `marked`로 렌더링된 내용 미리보기 (읽기 전용, 접기/펼치기)
- 저장 버튼 → OS 파일 저장 다이얼로그 → 사용자가 직접 저장 경로 지정

### 2. `/routines` — 루틴 목록
- DB에서 20개씩 페이징, **IntersectionObserver 무한 스크롤**
- 새 루틴 생성 (이름 입력 → `.md` 파일 생성 + DB insert → 편집 모드로 진입)
- 루틴 삭제 시 해당 `test/루틴명.js` + DB 레코드도 함께 삭제

### 3. `/routines/:name` — 루틴 상세
- **탭 구조**: 미리보기 / 편집 / 코드 (기본: 미리보기, 신규 생성 직후는 편집)
- 편집 모드: `textarea`로 `.md` 내용 수정 & 저장, Tab/Shift+Tab으로 2칸 indent
- 미리보기 모드: `marked.parse()`로 렌더링된 마크다운 표시
- **테스트 코드 생성** 버튼 (미리보기 모드에서만 표시):
  - 생성 중 스피너 + **중단(■)** 버튼 표시
  - Claude 출력 실시간 로그 스트림 표시
  - 완료 후 `test/루틴명.js` 생성 여부 확인 → 실행 버튼 활성화
- **실행** 버튼 (미리보기 모드, 코드 있을 때만 활성화):
  - `node test/루틴명.js [resultPath]` 실행
  - 완료 후 결과 상세 페이지로 이동

### 4. `/results` — 결과 목록
- DB에서 20개씩 페이징, **IntersectionObserver 무한 스크롤**
- **루틴명 검색** (입력 후 300ms debounce, 검색 시 1페이지 리셋)
- **상태 필터**: 전체 / ✓ 성공 / ✗ 실패
- 개별 삭제 (결과 JSON + 연관 스크린샷 + DB 레코드 삭제)

### 5. `/results/:id` — 결과 상세
- 루틴명, 실행 시각, 성공/실패 상태
- 실행 로그
- 에러 목록 (에러별 메시지 + 스크린샷)
- 스크린샷 클릭 시 라이트박스로 확대 표시 (ESC 또는 배경 클릭으로 닫기)
- 삭제 버튼 (연관 스크린샷 포함 삭제)

---

## IPC 채널 (Main ↔ Renderer)

| 채널 | 방향 | 설명 |
|------|------|------|
| `skills:list` | R→M | 스킬 목록 요청 |
| `skills:read` | R→M | 스킬 내용 읽기 |
| `skills:save-dialog` | R→M | 파일 저장 다이얼로그 → 스킬 저장 |
| `routines:list` | R→M | 루틴 목록 요청 `{ offset }` → `{ items, hasMore }` |
| `routines:create` | R→M | 루틴 생성 |
| `routines:read` | R→M | 루틴 내용 읽기 |
| `routines:update` | R→M | 루틴 내용 수정 |
| `routines:delete` | R→M | 루틴 + 연관 test/*.js + DB 레코드 삭제 |
| `run:generate` | R→M | Claude CLI 실행 → 테스트 코드 생성 |
| `run:cancel` | R→M | 생성 중인 Claude 프로세스 강제 종료 |
| `run:execute` | R→M | `node test/루틴명.js [resultPath]` 실행 → DB insert |
| `run:has-code` | R→M | `test/루틴명.js` 존재 여부 확인 |
| `results:list` | R→M | 결과 목록 요청 `{ offset, query, status }` → `{ items, hasMore }` |
| `results:read` | R→M | 결과 상세 읽기 (DB로 파일 경로 조회 후 JSON 파일 읽기) |
| `results:delete` | R→M | 결과 JSON + 연관 스크린샷 + DB 레코드 삭제 |
| `results:screenshot` | R→M | 스크린샷 절대 경로 반환 |
| `generate:log` | M→R | Claude 출력 실시간 스트리밍 |

---

## 실행 흐름

### 테스트 코드 생성 (Claude 사용)
```
1. 루틴 상세 미리보기 모드에서 [테스트 코드 생성] 클릭
2. IPC: run:generate 호출
3. Main: child_process.spawn으로 Claude CLI 실행 (shell: false)
     claude -p "/test_generator\n\n루틴 파일: routines/루틴명.md"
           --dangerously-skip-permissions --chrome
4. Main: stdout/stderr를 generate:log 이벤트로 Renderer에 스트리밍
5. Claude: SKILL.md 지시에 따라 루틴 파일 읽기 → Puppeteer 코드 작성
6. Claude: test/루틴명.js 파일 저장 후 종료 (result JSON 생성 안 함)
7. Main: 프로세스 종료 → run:generate 완료 응답
8. Renderer: run:has-code로 파일 존재 확인 → 실행 버튼 활성화
```

### 테스트 실행 (Claude 없음)
```
1. 루틴 상세 미리보기 모드에서 [실행] 클릭
2. IPC: run:execute 호출
3. Main: uniqueResultId(루틴명)으로 결과 파일 경로 생성 (덮어쓰기 없음)
4. Main: node test/루틴명.js results/루틴명-timestamp.json 실행
5. test/루틴명.js: process.argv[2]로 resultPath 수신 → 테스트 실행 → JSON 저장
6. Main: 완료 후 결과를 DB에 insert → 결과 ID 반환
7. Renderer: 결과 상세 페이지로 이동
```

---

## 결과 JSON 구조

```json
{
  "id": "루틴명-20240611-143022-abc123",
  "routineName": "login-test",
  "executedAt": "2024-06-11T14:30:22.000Z",
  "status": "fail",
  "log": "실행 로그 전체",
  "errors": [
    {
      "message": "버튼을 찾을 수 없음 (#login-btn)",
      "screenshot": "results/screenshots/루틴명-20240611-143022-abc123-1.png"
    }
  ]
}
```

- `id`는 `uniqueResultId(name)` 함수가 생성: `루틴명-timestamp`
- 동일 ID 파일이 존재하면 랜덤 hex를 붙여 재생성 (충돌 방지)
- result JSON은 오직 `test/루틴명.js` (Puppeteer 코드)가 직접 기록
- 결과 상세 조회 시 DB에서 `file_path`를 찾은 뒤 해당 JSON 파일을 읽음

---

## 스킬 시스템

- `skills/스킬명/SKILL.md` 형식으로 앱 내 관리
- Claude CLI는 `--chrome` 플래그로 실행 → Claude for Chrome 기능 활성화 필요
- 현재 등록 스킬: `test-generator`
  - Claude가 루틴 `.md`를 읽고 Puppeteer 21.x 코드를 `test/루틴명.js`에 작성
  - 코드 규칙: `require('puppeteer')`, async IIFE, 단계별 try/catch, 에러 시 스크린샷
  - 코드 실행 및 result JSON 생성은 스킬 범위 밖 (Main Process가 담당)

---

## 에디터 기능 (routine-detail.html)

- **Tab**: 커서 위치 또는 선택된 모든 줄에 2칸 indent 삽입
- **Shift+Tab**: 커서 위치 또는 선택된 모든 줄에서 앞 2칸 제거

---

## UI 테마

- 고정 단일 테마 (다크/라이트 토글 없음)
- **사이드바**: `#1e293b` 다크 네이비 계열
- **메인 콘텐츠**: `#f8fafc` 라이트 화이트 계열
- 커스텀 스크롤바, 마크다운 렌더 스타일 포함

---

## Electron + Puppeteer 샌드박스 충돌

Electron은 Chromium 기반이다. 그 안에서 Puppeteer가 또 Chromium을 띄우면 "Chromium 안의 Chromium" 구조가 되어 샌드박스 정책이 충돌한다.

증상: Puppeteer 코드를 한 번 실행하고 나면 Electron 앱 자체가 이상해짐 (`RESULT_CODE_KILLED_BAD_MESSAGE` 에러). 내부 Chromium의 렌더러 프로세스가 샌드박스 메시지 검증에서 걸려 강제 종료되고, 이 과정이 Electron 자체 프로세스에도 영향을 미친다.

해결책: Puppeteer 실행 시 아래 args를 반드시 포함한다. SKILL.md 코드 템플릿에 기본값으로 포함되어 있다.

```javascript
const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',             // 샌드박스 비활성화
    '--disable-setuid-sandbox', // setuid 샌드박스 비활성화
    '--disable-dev-shm-usage',  // 공유 메모리 충돌 방지
    // '--disable-gpu' 는 렌더링 결과에 영향을 줘서 제외
  ]
});
```

---

## 빌드

```bash
npm install      # better-sqlite3 포함 의존성 설치
npm run build    # electron-builder → dist/*.exe
```
