# DIT Daily Report

DIT Daily Data Report를 온라인에서 작성하고 PDF로 인쇄할 수 있는 웹앱입니다.

## 로컬 실행

```bash
node server.js
```

브라우저에서 `http://localhost:4178`을 엽니다.

## 온라인 배포

이 앱은 별도 API 키나 서버 데이터베이스가 필요 없는 정적 웹앱입니다. 배틀그라운드 리더보드와 같은 Render/Docker 방식으로 배포할 수 있게 구성되어 있습니다.

### Render

1. 이 폴더를 GitHub 저장소에 올립니다.
2. Render에서 새 Blueprint 또는 Web Service를 만듭니다.
3. Blueprint를 쓰면 `render.yaml`이 `Dockerfile`을 사용해 배포합니다.
4. 배포가 끝나면 `https://서비스이름.onrender.com`에서 앱을 엽니다.

## 파일

- `public/index.html`: 앱 화면
- `public/app.js`: 리포트 자동 입력 및 저장 로직
- `public/styles.css`: 화면 및 인쇄 스타일
- `server.js`: 온라인 배포용 정적 서버
- `Dockerfile`, `render.yaml`: Render 배포 설정
