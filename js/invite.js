// ===== 초대코드 및 친구 추가 =====
import { getUserByInviteCode, addFriend } from './db.js';
import { showToast } from '../main.js';

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
  const text = `모임 앱에서 나를 친구로 추가하려면 초대코드를 입력하세요: ${inviteCode}\nhttps://moim-app.workers.dev`;
  if (navigator.share) {
    await navigator.share({ title: '모임 초대코드', text });
  } else {
    await navigator.clipboard.writeText(text);
    showToast('초대코드가 복사되었습니다!', 'success');
  }
}

// 약속 딥링크 공유
export async function shareMeetingLink(meetingId, title) {
  const url  = `${location.origin}/pages/meeting.html?id=${meetingId}`;
  const text = `[모임] "${title}" 약속에 초대합니다!\n${url}`;
  if (navigator.share) {
    await navigator.share({ title: `모임 - ${title}`, text, url });
  } else {
    await navigator.clipboard.writeText(text);
    showToast('초대 링크가 복사되었습니다!', 'success');
  }
}
