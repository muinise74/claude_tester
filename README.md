# Puppeteer Test Runner

Claude CLI가 Puppeteer 코드를 생성하고, 생성된 코드를 저장해두었다가 반복 실행할 수 있는 로컬 자동화 앱.

---

## 목적

브라우저 자동화 작업을 매번 Claude에게 직접 시키는 대신 — 한 번 루틴을 작성해 Claude에게 코드를 생성시키고, 이후에는 버튼 하나로 반복 실행한다.

테스트 자동화뿐 아니라 크롤링, 스크래핑, 반복적인 브라우저 작업 전반에 활용할 수 있다.

---

## 사용 흐름

```
1. 루틴 작성  — 하고 싶은 작업을 마크다운으로 자연어 기술
2. 코드 생성  — Claude CLI가 루틴을 읽고 Puppeteer 코드 생성
3. 반복 실행  — 생성된 코드를 버튼 하나로 실행, 결과 및 스크린샷 확인
```

---

## 실행

```bash
npm install
npx electron-rebuild -f -w better-sqlite3   # 최초 1회
npm start
```

## 빌드

```bash
npm run build   # dist/*.exe 생성
```

---

## 주요 기능

- 루틴(`.md`) 작성 및 관리
- Claude CLI 연동 Puppeteer 코드 자동 생성
- 코드 실행 및 결과(로그 + 스크린샷) 저장
- 결과 목록 검색 및 무한 스크롤
- 스크린샷 라이트박스 확대 보기
