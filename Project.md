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
- **저장**: 파일 기반 (DB 없음)
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
│   ├── routines.html        # 루틴 목록 & 생성 & 삭제
│   ├── routine-detail.html  # 루틴 상세 (편집 / 미리보기 / 실행)
│   ├── results.html         # 결과 목록
│   └── result-detail.html   # 결과 상세
├── skills/                  # 스킬 디렉토리
│   └── 스킬명/
│       └── SKILL.md
├── routines/                # .md 루틴 파일
├── test/                    # 생성된 Puppeteer 코드 (루틴명.js)
└── results/                 # 실행 결과 JSON
    └── screenshots/         # 에러 스크린샷
```

---

## 페이지 구조

### 1. `/skills` — 스킬 관리
- `skills/` 하위 디렉토리 목록 표시
- 각 스킬: `marked`로 렌더링된 내용 미리보기 (읽기 전용, 접기/펼치기)
- 저장 버튼 → OS 파일 저장 다이얼로그 → 사용자가 직접 저장 경로 지정

### 2. `/routines` — 루틴 목록
- 저장된 루틴 `.md` 파일 목록 표시
- 새 루틴 생성 (이름 입력 → `.md` 파일 생성 → 편집 모드로 진입)
- 루틴 삭제 시 해당 `test/루틴명.js`도 함께 삭제

### 3. `/routines/:name` — 루틴 상세
- **탭 구조**: 미리보기 / 편집 (기본: 미리보기, 신규 생성 직후는 편집)
- 편집 모드: `textarea`로 `.md` 내용 수정 & 저장
- 미리보기 모드: `marked.parse()`로 렌더링된 마크다운 표시
- **테스트 코드 생성** 버튼 (미리보기 모드에서만 표시):
  - 생성 중 스피너 + **중단(■)** 버튼 표시
  - Claude 출력 실시간 로그 스트림 표시
  - 완료 후 `test/루틴명.js` 생성 여부 확인 → 실행 버튼 활성화
- **실행** 버튼 (미리보기 모드, 코드 있을 때만 활성화):
  - `node test/루틴명.js [resultPath]` 실행
  - 완료 후 결과 상세 페이지로 이동

### 4. `/results` — 결과 목록
- 실행된 결과 목록 (루틴명, 실행 시각, 성공/실패 배지)
- 개별 삭제 (연관 스크린샷 이미지도 함께 삭제)

### 5. `/results/:id` — 결과 상세
- 루틴명, 실행 시각, 성공/실패 상태
- 실행 로그
- 에러 목록 (에러별 메시지 + 스크린샷 이미지 렌더링)
- 삭제 버튼 (연관 스크린샷 포함 삭제)

---

## IPC 채널 (Main ↔ Renderer)

| 채널 | 방향 | 설명 |
|------|------|------|
| `skills:list` | R→M | 스킬 목록 요청 |
| `skills:read` | R→M | 스킬 내용 읽기 |
| `skills:save-dialog` | R→M | 파일 저장 다이얼로그 → 스킬 저장 |
| `routines:list` | R→M | 루틴 목록 요청 |
| `routines:create` | R→M | 루틴 생성 |
| `routines:read` | R→M | 루틴 내용 읽기 |
| `routines:update` | R→M | 루틴 내용 수정 |
| `routines:delete` | R→M | 루틴 + 연관 test/*.js 삭제 |
| `run:generate` | R→M | Claude CLI 실행 → 테스트 코드 생성 |
| `run:cancel` | R→M | 생성 중인 Claude 프로세스 강제 종료 |
| `run:execute` | R→M | `node test/루틴명.js [resultPath]` 실행 |
| `run:has-code` | R→M | `test/루틴명.js` 존재 여부 확인 |
| `results:list` | R→M | 결과 목록 요청 |
| `results:read` | R→M | 결과 상세 읽기 |
| `results:delete` | R→M | 결과 JSON + 연관 스크린샷 삭제 |
| `generate:log` | M→R | Claude 출력 실시간 스트리밍 (ipcMain.emit) |

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
4. Main: node test/루틴명.js results/루틴명-timestamp-random.json 실행
5. test/루틴명.js: process.argv[2]로 resultPath 수신 → 테스트 실행 → JSON 저장
6. Main: 실행 완료 후 결과 ID 반환
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

- `id`는 `uniqueResultId(name)` 함수가 생성: `루틴명-YYYYMMDD-HHmmss-랜덤4자리`
- 동일 ID 파일이 존재하면 랜덤 부분을 재생성 (충돌 방지)
- result JSON은 오직 `test/루틴명.js` (Puppeteer 코드)가 직접 기록

---

## 스킬 시스템

- `skills/스킬명/SKILL.md` 형식으로 앱 내 관리
- Claude CLI는 `--chrome` 플래그로 실행 → Claude for Chrome 기능 활성화 필요
- 현재 등록 스킬: `test-generator`
  - Claude가 루틴 `.md`를 읽고 Puppeteer 21.x 코드를 `test/루틴명.js`에 작성
  - 코드 규칙: `require('puppeteer')`, async IIFE, 단계별 try/catch, 에러 시 스크린샷
  - 코드 실행 및 result JSON 생성은 스킬 범위 밖 (Main Process가 담당)

---

## UI 테마

- 고정 단일 테마 (다크/라이트 토글 없음)
- **사이드바**: `#1e293b` 다크 네이비 계열
- **메인 콘텐츠**: `#f8fafc` 라이트 화이트 계열
- 커스텀 스크롤바, 마크다운 렌더 스타일 포함

---

## 빌드

```bash
npm run build  # electron-builder → dist/*.exe
```
