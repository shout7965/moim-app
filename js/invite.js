// ===== 초대코드 및 친구 추가 =====
import { getUserByInviteCode, addFriend } from './db.js';
import { showToast } from '../main.js';
import { KAKAO_JS_KEY } from './firebase-config.js';

// 초대코드로 친구 추가
export async function addFriendByCode(myUid, myProfile, code) {
  const trimmed = code.trim().toUpperCase();
  if (trimmed.length !== 6) throw new Error('초대코드는 6자리입니다.');

  if (trimmed === myProfile.inviteCode) throw new Error('자신의 초대코드는 사용할 수 없어요.');

  const friend = await getUserByInviteCode(trimmed);
  if (!friend) throw new Error('유효하지 않은 초대코드예요.');

  if (myProfile.friends?.includes(friend.uid)) throw new Error('이미 친구입니다.');

  await addFriend(myUid, friend.uid);
  return friend;
}

// 내 초대코드 공유
export async function shareMyCode(inviteCode) {
  const text = `어디쯤왔어?? 앱에서 나를 친구로 추가하려면 초대코드를 입력하세요: ${inviteCode}\nhttps://moim-app.workers.dev`;
  if (navigator.share) {
    await navigator.share({ title: '어디쯤왔어?? 초대코드', text });
  } else {
    await navigator.clipboard.writeText(text);
    showToast('초대코드가 복사되었습니다!', 'success');
  }
}

// 약속 딥링크 공유
export async function shareMeetingLink(meetingId, title) {
  const url  = `${location.origin}/pages/meeting.html?id=${meetingId}`;
  const text = `[어디쯤왔어??] "${title}" 약속에 초대합니다!`;

  // 카카오톡 공유 (버튼형 카드)
  await ensureKakaoSDK();
  if (window.Kakao?.Share?.sendDefault) {
    try {
      window.Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: `어디쯤왔어?? - ${title}`,
          description: '약속 상세를 확인하고 수락할 수 있어요.',
          imageUrl: `${location.origin}/icons/icon-512.png`,
          link: {
            mobileWebUrl: url,
            webUrl: url,
          },
        },
        buttons: [
          {
            title: '약속 확인하기',
            link: {
              mobileWebUrl: url,
              webUrl: url,
            },
          },
        ],
      });
      return;
    } catch (e) {
      console.warn('Kakao share failed:', e);
    }
  }

  // 일반 공유 / 복사
  if (navigator.share) {
    // 일부 공유 앱(카카오톡 등)에서 text+url 중복 노출 방지
    await navigator.share({ title: `어디쯤왔어?? - ${title}`, text, url });
  } else {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    showToast('초대 링크가 복사되었습니다!', 'success');
  }
}

function ensureKakaoSDK() {
  return new Promise((resolve) => {
    if (window.Kakao?.isInitialized?.()) { resolve(); return; }
    const existing = document.querySelector('script[data-kakao-sdk]');
    if (existing) {
      if (window.Kakao) {
        if (!window.Kakao.isInitialized?.()) window.Kakao.init?.(KAKAO_JS_KEY);
        resolve();
        return;
      }
      existing.addEventListener('load', () => {
        if (!window.Kakao?.isInitialized?.()) window.Kakao?.init?.(KAKAO_JS_KEY);
        resolve();
      });
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js';
    s.dataset.kakaoSdk = '1';
    s.onload = () => {
      if (!window.Kakao?.isInitialized?.()) window.Kakao?.init?.(KAKAO_JS_KEY);
      resolve();
    };
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}
