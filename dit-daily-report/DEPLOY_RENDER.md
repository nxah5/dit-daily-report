# 현재 Render 설정에 맞춘 GitHub 배포 안내

## 1. GitHub에 업로드

1. GitHub의 `nxah5/dit-daily-report` 저장소를 엽니다.
2. 전달받은 ZIP 파일의 압축을 풉니다.
3. 안에 있는 `dit-daily-report-online` 폴더를 저장소 최상위에 업로드합니다.
4. GitHub에서 아래 경로가 보이는지 확인합니다.

```text
dit-daily-report-online/
├ Dockerfile
├ .dockerignore
├ package.json
├ pnpm-lock.yaml
├ app/
└ public/
```

`node_modules`, `.env`, 로컬 빌드 결과물과 사용자가 브라우저에 입력한 리포트
데이터는 ZIP에 포함되지 않습니다.

## 2. Render 설정값

현재 `dit-report` Web Service의 Settings 화면을 아래와 같이 맞춥니다.

| Render 항목 | 입력값 |
| --- | --- |
| Source | `nxah5/dit-daily-report` |
| Branch | `main` |
| Root Directory | `dit-daily-report-online` |
| Registry Credential | `No credential` |
| Dockerfile Path | `./Dockerfile` |
| Docker Build Context Directory | `.` |
| Docker Command | 비워 둠 |
| Pre-Deploy Command | 비워 둠 |
| Auto-Deploy | `On Commit` |
| Health Check Path | `/` |

Root Directory가 지정되어 있으므로 Dockerfile Path와 Docker Build Context는
저장소 전체 경로가 아니라 해당 폴더를 기준으로 입력합니다.

설정을 저장한 뒤 **Manual Deploy → Deploy latest commit**을 실행합니다.
배포가 끝나면 `https://dit-daily-report.onrender.com`과
`https://dit-daily-report.onrender.com/report`를 확인합니다.

별도의 API 키나 Registry Credential은 필요하지 않습니다.

Docker 이미지는 빌드 단계와 실행 단계를 분리합니다. 실행 단계에는 pnpm,
빌드 도구, 데이터베이스 예제가 포함되지 않으며 독립 실행 서버만 시작됩니다.
Render의 Docker Command에는 별도 명령을 입력하지 마세요.

## 3. 업데이트

수정된 `dit-daily-report-online` 폴더를 같은 GitHub 저장소의 `main`
브랜치에 다시 업로드하거나 푸시하면 Render가 자동으로 새 버전을 배포합니다.

## 참고

- 입력 내용은 서버가 아니라 각 브라우저의 로컬 저장소에 저장됩니다.
- 다른 기기 또는 다른 브라우저에는 입력 내용이 자동으로 공유되지 않습니다.
- PDF는 출력 페이지에서 **인쇄 / PDF 저장** 버튼으로 생성합니다.
