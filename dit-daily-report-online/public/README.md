# DIT Daily Data Report App

로컬에서 실행되는 DIT 데일리 리포트 작성 도구입니다.

## 실행

- 웹 버전: `index.html`을 브라우저에서 엽니다.
- 앱 버전: `DITDailyReport.app`을 더블클릭합니다.

## 주요 기능

- 프로젝트 정보 자동 반영
- 파일 트리 자동 생성 및 직접 편집
- 카메라, 프록시, 미디어 롤 로그 입력
- 폴더 분석으로 롤/용량/클립 수 자동 산출
- CSV 롤 로그 가져오기
- 백업 스토리지, QC 체크리스트, 이슈 로그, 인계 정보 관리
- JSON 저장/불러오기
- PDF 인쇄

## CSV 헤더

```csv
rollName,camera,cardSizeGB,offloadSizeGB,checksum,status,clipCount,source,destination,notes
```
