# JK Message (Real-Time Web Messenger)

아이디 기반 회원가입, 1:1 실시간 대화, 다자간 단체 채팅방, 파일/미디어 첨부, 온라인/방해금지 상태 및 웹소켓 실시간 알림을 제공하는 고성능 풀스택 웹 메신저입니다.

---

## ✨ 주요 기능 (Features)

1. **아이디 기반 계정 시스템**
   - 영문/숫자 고유 아이디 및 비밀번호로 손쉬운 가입/로그인
   - 프로필 커스텀 (이름, 16종 프리미엄 그라데이션 아바타, 이모지, 상태 메시지)
2. **친구 관리 시스템**
   - 아이디 검색을 통한 친구 요청 발송 / 수락 / 거절
   - 친구 목록 및 실시간 접속 상태 표시
3. **실시간 1:1 및 단체 채팅방**
   - WebSocket 기반 양방향 실시간 메시징
   - 단체 채팅방 생성, 멤버 초대, 방 나가기
   - 답장(Reply), 이모지 반응(Reactions), 읽음 확인(Read Receipts), 타이핑 상태 표시
4. **파일 및 미디어 첨부 지원**
   - 이미지, 오디오, 비디오, 문서, 압축 파일 첨부 및 원클릭 다운로드
   - 채팅창 드래그 앤 드롭(Drag & Drop) 파일 전송
   - 이미지 풀스크린 확대 뷰어, 오디오/비디오 인라인 플레이어
5. **스마트 알림 & 접속 상태**
   - Web Audio API 기반 오디오 효과음 알림 (메시지 수신, 전송음)
   - 브라우저 푸시 알림 (Web Notification API)
   - 온라인 / 방해 금지(DND 30분/1시간/직접 해제까지) / 오프라인 상태 관리
6. **클라우드 데이터베이스 & 영속성 (Firebase Firestore & Local Persistence)**
   - **Firebase Firestore** 연동을 통해 서버가 재부팅되거나 새 버전으로 재배포되어도 계정 정보, 친구 관계, 단체 채팅방, 메시지 내역이 절대 초기화되지 않고 안전하게 영구 보존됩니다.
   - 로컬 백업(`data/db.json` 및 `data/uploads/`) 또한 병행 지원됩니다.

---

## 🚀 빠른 시작 (Local Development)

### 1. 요구 사항
- **Node.js**: v18.0.0 이상 (v20+ 권장)
- **npm** 또는 **yarn / pnpm / bun**

### 2. 설치 (Installation)
```bash
# 의존성 패키지 설치
npm install
```

### 3. 개발 서버 실행 (Development Mode)
```bash
# Vite + Express 개발 서버 구동 (기본 포트: 3000)
npm run dev
```
브라우저에서 `http://localhost:3000` 으로 접속하여 메신저를 사용합니다.

---

## 📦 프로덕션 빌드 및 실행 (Production)

```bash
# 1. 프론트엔드 및 백엔드 번들 빌드
npm run build

# 2. 프로덕션 서버 실행
npm start
```

---

## 🐙 GitHub에 소스코드 올리는 방법 (Push to GitHub)

### 방법 A: AI Studio에서 바로 내보내기 (가장 간편함)
1. 우측 상단 **Settings(설정)** 메뉴를 클릭합니다.
2. **Export to GitHub** 또는 **Download ZIP**을 선택하여 개인 GitHub 리포지토리에 즉시 푸시하거나 압축파일로 다운로드할 수 있습니다.

### 방법 B: 터미널에서 Git으로 수동 푸시
```bash
# 1. git 저장소 초기화 (미설정 시)
git init
git add .
git commit -m "feat: Initial commit for JK Message"

# 2. 원격 리포지토리 연결 및 푸시
git branch -M main
git remote add origin https://github.com/당신의유저네임/jk-message.git
git push -u origin main
```

---

## 🌐 무료 클라우드 배포 가이드 (Deployment)

### Render (추천)
1. [Render.com](https://render.com)에 로그인 후 **New +** -> **Web Service** 선택
2. 연결할 GitHub 리포지토리(`jk-message`) 선택
3. 환경 설정:
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Free

### Railway
1. [Railway.app](https://railway.app)에서 **New Project** -> **Deploy from GitHub repo** 선택
2. 별도 설정 없이 `npm run build`와 `npm start`를 자동으로 감지하여 원클릭 배포됩니다.

### Docker 배포 (선택 사항)
```dockerfile
# Dockerfile 예시
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

---

## 📂 프로젝트 구조 (Project Structure)

```text
├── data/                  # 로컬 JSON 데이터 및 업로드 파일 저장소
│   ├── db.json            # 사용자, 대화, 메시지, 단체방 데이터
│   └── uploads/           # 첨부파일 저장 디렉터리
├── src/
│   ├── components/        # React UI 컴포넌트
│   │   ├── AddFriendModal.tsx          # 친구 추가 및 요청 관리
│   │   ├── AuthModal.tsx               # 회원가입 및 로그인 팝업
│   │   ├── ChatArea.tsx                # 대화방 본문, 입력창, 미디어 뷰어
│   │   ├── CreateGroupModal.tsx        # 단체 채팅방 생성 모달
│   │   ├── GroupInfoModal.tsx          # 단체방 멤버 및 초대 관리
│   │   ├── ProfileModal.tsx            # 프로필 수정 모달
│   │   ├── Sidebar.tsx                 # 대화/친구 목록, 상태 변경 사이드바
│   │   └── StatusPickerModal.tsx       # 방해금지/온라인 모달
│   ├── utils/
│   │   ├── audio.ts                    # Web Audio 알림음 합성기
│   │   └── notifications.ts            # 브라우저 알림 제어기
│   ├── types.ts           # TypeScript 공통 인터페이스
│   ├── App.tsx            # 메인 앱 컨테이너 및 웹소켓 컨트롤러
│   └── main.tsx           # React 진입점
├── server.ts              # Express API 라우트 & WebSocket 실시간 서버
├── vite.config.ts         # Vite 빌드 설정
├── package.json           # 프로젝트 설정 및 의존성
└── tsconfig.json          # TypeScript 컴파일러 설정
```

---

## 📜 라이선스 (License)
MIT License
