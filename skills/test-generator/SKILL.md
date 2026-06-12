# Puppeteer Test Code Generator

## 역할

Claude in Chrome을 사용해 루틴 md에 명시된 순서대로 페이지를 탐색하고 DOM을 파악한 뒤, 동일한 동작을 수행하는 Puppeteer 테스트 코드를 작성해 지정된 경로에 저장한다.

---

## 입력

{루틴 md} — 테스트할 흐름이 자연어로 순서대로 작성된 파일. 이 스킬의 모든 작업은 {루틴 md} 를 기반으로 수행된다.

---

## 작업 순서

1. claude-in-chrome 도구를 사용한다
2. {루틴 md} 를 읽고 테스트 흐름 파악
3. claude-in-chrome으로 {루틴 md} 순서대로 페이지 탐색
4. 각 단계에서 필요한 셀렉터 및 DOM 구조 파악
5. 파악한 내용을 기반으로 Puppeteer 코드 작성
6. 작성한 코드를 지정된 경로에 저장

---

## 탐색 규칙

- {루틴 md} 에 작성된 순서를 반드시 따른다
- 각 단계마다 실제 페이지를 열어 DOM을 직접 확인한다
- 셀렉터는 추측하지 않고 실제 DOM에서 확인한 값을 사용한다
- 태그명(a, button, div 등)도 반드시 실제 DOM에서 확인한다. 화면에 보이는 텍스트만으로 태그를 추측하지 않는다
- `window.open`, 링크 클릭 등으로 새 탭이 열리면 해당 탭으로 전환해서 탐색을 계속한다

---

## 코드 작성 규칙

### 기본 구조
- 코드는 반드시 완전히 실행 가능한 Node.js 파일이어야 한다
- `require('puppeteer')`로 puppeteer를 불러오고, 전체 로직을 async IIFE `(async () => { ... })()` 로 감싼다
- 사용 puppeteer 버전: **21.x** (`"puppeteer": "^21.0.0"`) — 이 버전 API 기준으로 코드를 작성한다
- 전체 테스트가 끝까지 실행되면 성공 (exit code 0)
- 실행 중 에러가 throw되면 실패 (exit code 1)
- 모든 코드는 async/await 기반으로 작성

### 브라우저 콘솔 에러 캡처
- `page.on('console')` 으로 콘솔 메시지 캡처
- `console.error` 타입의 메시지는 반드시 수집
- 수집된 콘솔 에러는 테스트 종료 시 출력

### 새 탭 처리
- `window.open` 또는 `target="_blank"` 링크로 새 탭이 열리는 경우 `browser.waitForTarget` 으로 감지 후 해당 탭으로 전환한다
- 새 탭 전환 후 기존 탭은 닫지 않고 유지한다 (루틴에 명시된 경우 제외)

### 에러 처리 및 스크린샷
- try/catch로 각 단계를 감싸 에러 발생 시 스크린샷 저장
- 스크린샷 저장 후 에러를 다시 throw하여 테스트 중단
- 스크린샷 파일명: `루틴명-단계번호-timestamp.png`

### 변수 처리
- {루틴 md} 에 실행 시 입력받는 변수가 있다는 언급이 있을 때만 적용한다
- 변수는 `process.argv[3]`, `process.argv[4]`... 순서대로 받는다 (`argv[2]`는 resultPath가 사용)
- 루틴 md에 변수 순서와 의미가 명시되어 있으면 그 순서대로 매핑한다
- 변수 언급이 없으면 값을 하드코딩한다

### 기댓값 처리
- {루틴 md} 에 기댓값이 명시된 경우 → assert 코드로 변환하여 검증
- 로그인, 버튼 클릭, 폼 제출 등 기능적인 동작은 기댓값이 없을 수 있음
  → 이 경우 에러 없이 끝나면 성공으로 간주
- UI 관련 테스트(특정 텍스트 표시, URL 확인 등)는 {루틴 md} 에 기댓값이 명시됨

---

## 저장 경로

| 항목 | 경로 |
|------|------|
| 테스트 코드 | 입력으로 전달받은 `테스트 코드 저장 경로` (절대경로) |
| 스크린샷 | `테스트 코드 저장 경로`에서 `test` 부분을 `results/screenshots`로 치환한 경로 |

- 저장 전 디렉토리가 없으면 생성

## 작업 완료 조건

**Claude의 역할은 `test/루틴명.js` 파일을 작성하는 것으로 끝난다. 코드를 실행하지 않는다. 결과 JSON을 직접 만들지 않는다.**

결과 JSON은 작성한 Puppeteer 코드가 앱에 의해 실행될 때 코드 내부에서 생성된다.
결과 JSON 저장 경로는 앱이 `process.argv[2]`로 전달하며, 반드시 그 경로를 사용한다.

---

## 코드 템플릿

```javascript
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const ROUTINE_NAME = '루틴명';
// 결과 JSON 저장 경로는 실행 시 argv[2]로 전달받는다 — 앱이 고유 경로를 보장함
const RESULT_PATH = process.argv[2];
const SCREENSHOT_DIR = path.dirname(RESULT_PATH).replace('results', 'results/screenshots');

// 디렉토리 생성
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const errors = [];
const logs = [];

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ]
  });
  const page = await browser.newPage();
  const startedAt = new Date().toISOString();
  let status = 'success';

  // 브라우저 콘솔 캡처
  page.on('console', (msg) => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
  });

  try {

    // 단계 1
    await step1(page);

    // 단계 2
    await step2(page);

    // ... 루틴 순서대로

  } catch (err) {
    status = 'fail';
  } finally {
    await browser.close();

    // 앱에서 전달받은 경로에 저장 — 파일명 충돌 없음
    const id = path.basename(RESULT_PATH, '.json');
    fs.writeFileSync(RESULT_PATH, JSON.stringify({
      id,
      routineName: ROUTINE_NAME,
      executedAt: startedAt,
      status,
      log: logs.join('\n'),
      errors,
    }, null, 2));
  }
})();

async function takeScreenshot(page, stepName) {
  const filename = `${ROUTINE_NAME}-${stepName}-${Date.now()}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath });
  errors.push({ message: `${stepName} 실패`, screenshot: path.relative(path.join(__dirname, '..'), filepath).replace(/\\/g, '/') });
}

async function step1(page) {
  try {
    // 단계 구현
  } catch (err) {
    await takeScreenshot(page, 'step1');
    throw err;
  }
}
```