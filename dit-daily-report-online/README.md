# DIT Daily Report

촬영 현장의 미디어 롤, 오프로드, ON-SET 카메라 세팅, 저장매체, QC, 인계,
폴더트리 정보를 입력하고 A4 데일리 리포트로 출력하는 웹앱입니다. 초기
화면에는 개인 또는 프로젝트 더미 데이터가 포함되지 않습니다.

## 주요 기능

- 입력 페이지와 출력 미리보기 페이지 분리
- 입력 내용 브라우저 자동 저장
- 롤·오프로드·클립·백업본 자동 합계
- Camera·Body·Codec/Resolution·FPS·Color Space·LUT 기반 ON-SET 기록
- 계층형 폴더 추가·수정·삭제 및 출력용 폴더 트리 자동 생성
- 저장매체 상태 드롭다운 제공
- 표지 → 전체 요약 → 세부 페이지 순서의 A4 출력
- 브라우저 인쇄 메뉴를 이용한 PDF 저장

## 로컬 실행

Node.js 22.13 이상이 필요합니다.

```bash
npm install --global pnpm@11.9.0
pnpm install
pnpm run dev
```

빌드 확인:

```bash
pnpm run build
pnpm test
```

## GitHub 업로드

전달받은 ZIP의 압축을 푼 뒤, 안에 있는 `dit-daily-report-online` 폴더를
GitHub 저장소 최상위에 업로드합니다. Render의 Root Directory 설정과 같은
이름이므로 폴더명을 바꾸지 마세요. `.env`, 의존성, 로컬 빌드 결과물은
패키지에 포함되지 않습니다.

## Render 배포

현재 Render 서비스의 Docker 설정에 맞춘 `Dockerfile`이 포함되어 있습니다.
배포 컨테이너에는 전체 개발 도구 대신 독립 실행 서버와 필요한 파일만
포함되며, Node.js 메모리 상한도 Render 무료 인스턴스에 맞게 설정됩니다.

1. Root Directory를 `dit-daily-report-online`로 지정합니다.
2. Dockerfile Path를 `./Dockerfile`로 지정합니다.
3. Docker Build Context Directory를 `.`으로 지정합니다.
4. Docker Command와 Pre-Deploy Command는 비워 둡니다.
5. 배포 후 입력 페이지와 `/report` 출력 페이지를 확인합니다.

사이트 데이터는 현재 사용 중인 브라우저의 로컬 저장소에 보관됩니다.
다른 기기나 브라우저와 자동 동기화되지 않습니다.

상세한 배포 순서는 [DEPLOY_RENDER.md](./DEPLOY_RENDER.md)를 확인하세요.
