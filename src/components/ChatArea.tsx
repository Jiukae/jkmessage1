import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User, Message, MessageReply, GroupRoom, MessageAttachment } from '../types';
import {
  Send,
  Smile,
  Paperclip,
  Reply,
  Copy,
  Check,
  CheckCheck,
  Search,
  X,
  Sparkles,
  Info,
  ChevronDown,
  Image as ImageIcon,
  FileText,
  Music,
  Video,
  Download,
  ArrowLeft,
  Users,
  Eye,
  Loader2,
  File,
  Shield,
  SmilePlus,
  Heart,
  ThumbsUp,
} from 'lucide-react';

interface ChatAreaProps {
  currentUser: User;
  partner?: User;
  group?: GroupRoom;
  isGroup?: boolean;
  groupMembers?: User[];
  messages: Message[];
  conversationId: string;
  isPartnerOnline?: boolean;
  partnerStatusMode?: 'online' | 'dnd' | 'offline';
  isPartnerTyping?: boolean;
  typingText?: string;
  onSendMessage: (text: string, replyTo?: MessageReply, attachment?: MessageAttachment) => void;
  onReactMessage: (messageId: string, emoji: string) => void;
  onTyping: () => void;
  onOpenPartnerDetails?: () => void;
  onOpenGroupInfo?: () => void;
  onBack?: () => void;
}

const COMMON_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '🔥', '👏', '🙏', '✨', '😍', '🤔', '😭'];
const QUICK_STICKERS = [
  '안녕하세요! 반갑습니다 😊',
  '네, 확인했습니다! 👍',
  '감사합니다! 좋은 하루 되세요 ✨',
  '잠시만 기다려주세요 ⏳',
  '축하드립니다! 🎉🎉',
];

export const ChatArea: React.FC<ChatAreaProps> = ({
  currentUser,
  partner,
  group,
  isGroup = false,
  groupMembers = [],
  messages,
  conversationId,
  isPartnerOnline = false,
  partnerStatusMode = 'offline',
  isPartnerTyping = false,
  typingText,
  onSendMessage,
  onReactMessage,
  onTyping,
  onOpenPartnerDetails,
  onOpenGroupInfo,
  onBack,
}) => {
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<MessageReply | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showStickerMenu, setShowStickerMenu] = useState(false);
  const [searchInChat, setSearchInChat] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // File Attachment State
  const [pendingAttachment, setPendingAttachment] = useState<MessageAttachment | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Lightbox Preview
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isPartnerTyping, pendingAttachment]);

  // Handle local file read & upload
  const handleProcessFile = async (file: File) => {
    if (!file) return;
    setUploadError(null);
    setIsUploading(true);

    try {
      // 25MB limit
      if (file.size > 25 * 1024 * 1024) {
        throw new Error('파일 용량은 최대 25MB까지 첨부할 수 있습니다.');
      }

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          const formatSize = (bytes: number) => {
            if (bytes < 1024) return `${bytes} B`;
            if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
            return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
          };

          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: file.name,
              fileType: file.type || 'application/octet-stream',
              fileData: base64Data,
              fileSize: formatSize(file.size),
            }),
          });

          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || '파일 업로드에 실패했습니다.');
          }

          setPendingAttachment(data.attachment);
        } catch (err: any) {
          setUploadError(err.message || '파일 처리 실패');
        } finally {
          setIsUploading(false);
        }
      };

      reader.onerror = () => {
        setUploadError('파일을 읽는 중 오류가 발생했습니다.');
        setIsUploading(false);
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      setUploadError(err.message || '파일 첨부 실패');
      setIsUploading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
    e.target.value = '';
  };

  // Drag and drop handler
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() && !pendingAttachment) return;

    onSendMessage(
      inputText.trim(),
      replyingTo || undefined,
      pendingAttachment || undefined
    );

    setInputText('');
    setPendingAttachment(null);
    setReplyingTo(null);
    setShowEmojiPicker(false);
    setShowStickerMenu(false);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else {
      onTyping();
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    onTyping();
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  const handleCopyMessage = (msgId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  // Filter messages if search active and deduplicate
  const displayedMessages = useMemo(() => {
    const seen = new Set<string>();
    return messages.filter((m) => {
      if (!m || !m.id) return false;
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      if (!searchInChat.trim()) return true;
      const q = searchInChat.toLowerCase();
      const matchText = m.text && m.text.toLowerCase().includes(q);
      const matchFile = m.attachment && m.attachment.name.toLowerCase().includes(q);
      return matchText || matchFile;
    });
  }, [messages, searchInChat]);

  const formatDateLabel = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
  };

  const formatMessageTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Helper to render file icon based on attachment type
  const renderAttachmentIcon = (type: string, name: string) => {
    if (type === 'image') return <ImageIcon className="w-5 h-5 text-indigo-400" />;
    if (type === 'audio') return <Music className="w-5 h-5 text-emerald-400" />;
    if (type === 'video') return <Video className="w-5 h-5 text-purple-400" />;
    if (name.endsWith('.pdf')) return <FileText className="w-5 h-5 text-rose-400" />;
    return <File className="w-5 h-5 text-blue-400" />;
  };

  return (
    <main
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex-1 h-full flex flex-col bg-transparent min-w-0 relative transition-colors ${
        isDragging ? 'bg-indigo-950/20' : ''
      }`}
    >
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileInputChange}
        className="hidden"
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-40 bg-indigo-900/60 backdrop-blur-sm border-2 border-dashed border-indigo-400 rounded-3xl m-4 flex flex-col items-center justify-center text-white pointer-events-none animate-in fade-in">
          <Paperclip className="w-12 h-12 text-indigo-300 animate-bounce mb-3" />
          <p className="text-base font-bold">여기에 파일을 끌어다 놓으세요</p>
          <p className="text-xs text-white/60 mt-1">이미지, 동영상, 음성, 문서 등 최대 25MB</p>
        </div>
      )}

      {/* Image Lightbox Modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in"
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img
              src={previewImage}
              alt="Enlarged preview"
              className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl border border-white/10"
            />
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-12 right-0 p-2 text-white/70 hover:text-white bg-white/10 rounded-full"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="h-16 px-3 sm:px-4 md:px-6 border-b border-white/10 bg-black/20 backdrop-blur-xl flex items-center justify-between shrink-0 z-10">
        
        {/* Left Side: Mobile Back + Partner/Group Info */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {onBack && (
            <button
              id="chat-header-mobile-back-btn"
              type="button"
              onClick={onBack}
              className="md:hidden p-2 -ml-1 text-white/70 hover:text-white rounded-xl hover:bg-white/10 active:scale-95 transition-all shrink-0"
              title="뒤로 가기"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          {isGroup && group ? (
            /* Group Header */
            <div
              onClick={onOpenGroupInfo}
              className="flex items-center gap-2.5 sm:gap-3 min-w-0 cursor-pointer p-1 rounded-2xl hover:bg-white/5 transition-all group"
            >
              <div className="relative shrink-0">
                <div className={`w-10 h-10 rounded-2xl bg-gradient-to-tr ${group.avatarBg || 'from-amber-500 to-rose-600'} border border-white/15 flex items-center justify-center text-lg shadow-md group-hover:scale-105 transition-transform`}>
                  {group.avatarEmoji || '👥'}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-indigo-500 border-2 border-[#0c0e14] flex items-center justify-center text-[8px] text-white font-bold">
                  {group.participantIds.length}
                </span>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-sm text-white group-hover:text-indigo-300 transition-colors truncate">
                    {group.name}
                  </span>
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-md border border-indigo-400/20 shrink-0 font-medium">
                    단체방 • {group.participantIds.length}명
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-white/40">
                  {typingText ? (
                    <span className="text-indigo-400 font-medium flex items-center gap-1">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" />
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:0.2s]" />
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:0.4s]" />
                      <span className="truncate">{typingText}</span>
                    </span>
                  ) : (
                    <span className="truncate">
                      {groupMembers.map((m) => m.name).join(', ') || '멤버 목록'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : partner ? (
            /* 1:1 Partner Header */
            <div
              onClick={onOpenPartnerDetails}
              className="flex items-center gap-2.5 sm:gap-3 min-w-0 cursor-pointer p-1 rounded-2xl hover:bg-white/5 transition-all group"
            >
              <div className="relative shrink-0">
                <div className={`w-9.5 h-9.5 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr ${partner.avatarBg || 'from-blue-500 to-purple-500'} border border-white/15 flex items-center justify-center text-lg shadow-md group-hover:scale-105 transition-transform`}>
                  {partner.avatarEmoji || '💬'}
                </div>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0c0e14] ${
                    partnerStatusMode === 'dnd'
                      ? 'bg-rose-500 shadow-sm shadow-rose-500/50 ring-1 ring-rose-400/30'
                      : isPartnerOnline || partnerStatusMode === 'online'
                      ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50 ring-1 ring-emerald-400/30'
                      : 'bg-white/30'
                  }`}
                />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-sm text-white group-hover:text-blue-300 transition-colors truncate">
                    {partner.name}
                  </span>
                  <span className="text-[11px] sm:text-xs text-blue-400 font-mono bg-blue-500/10 px-1.5 py-0.5 rounded-md border border-blue-400/20 shrink-0">
                    @{partner.username}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-xs">
                  {isPartnerTyping ? (
                    <span className="text-blue-400 font-medium flex items-center gap-1">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" />
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:0.2s]" />
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:0.4s]" />
                      <span className="truncate">{partner.username} 입력 중...</span>
                    </span>
                  ) : (
                    <span
                      className={`truncate ${
                        partnerStatusMode === 'dnd'
                          ? 'text-rose-400 text-[11px] font-medium'
                          : isPartnerOnline || partnerStatusMode === 'online'
                          ? 'text-emerald-400 text-[11px] font-medium'
                          : 'text-white/40 text-[11px]'
                      }`}
                    >
                      {partnerStatusMode === 'dnd'
                        ? '방해 금지'
                        : isPartnerOnline || partnerStatusMode === 'online'
                        ? '온라인'
                        : '오프라인'}
                      {partner.customStatus && ` • ${partner.customStatus}`}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          <button
            id="toggle-search-in-chat-btn"
            type="button"
            onClick={() => setShowSearch(!showSearch)}
            className={`p-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-colors ${
              showSearch ? 'bg-white/15 text-indigo-400 border-indigo-400/30' : ''
            }`}
            title="대화 검색"
          >
            <Search className="w-4 h-4" />
          </button>

          {isGroup ? (
            <button
              id="group-info-btn"
              type="button"
              onClick={onOpenGroupInfo}
              className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1 text-xs"
              title="그룹 정보 / 멤버 관리"
            >
              <Users className="w-4 h-4 text-indigo-400" />
            </button>
          ) : (
            <button
              id="partner-profile-info-btn"
              type="button"
              onClick={onOpenPartnerDetails}
              className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              title="상대방 프로필 정보"
            >
              <Info className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Search within conversation bar */}
      {showSearch && (
        <div className="px-4 py-2 bg-black/40 backdrop-blur-xl border-b border-white/10 flex items-center gap-2 animate-in slide-in-from-top-2 duration-150 shrink-0">
          <Search className="w-4 h-4 text-white/40" />
          <input
            id="search-in-chat-input"
            type="text"
            value={searchInChat}
            onChange={(e) => setSearchInChat(e.target.value)}
            placeholder="이 대화방에서 메시지 또는 파일 검색..."
            className="flex-1 bg-transparent border-none text-white placeholder-white/30 text-xs focus:outline-none"
            autoFocus
          />
          {searchInChat && (
            <button
              onClick={() => setSearchInChat('')}
              className="text-white/40 hover:text-white p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-4 min-h-0">
        
        {displayedMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-white/40">
            <div className="w-16 h-16 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center text-3xl mb-3 shadow-inner">
              {isGroup ? (group?.avatarEmoji || '👥') : (partner?.avatarEmoji || '✨')}
            </div>
            <p className="font-semibold text-white/80 text-sm">
              {isGroup ? `'${group?.name}' 그룹 대화 시작` : `${partner?.name} 님과의 대화 시작`}
            </p>
            <p className="text-xs text-white/40 mt-1 max-w-xs">
              {isGroup
                ? '단체 채팅방 멤버들과 자유롭게 메시지와 파일, 사진을 주고받아보세요.'
                : `@${partner?.username} 님에게 첫 메시지나 파일을 보내보세요!`}
            </p>
          </div>
        ) : null}

        {displayedMessages.map((msg, index) => {
          const isMe = msg.senderId === currentUser.id;
          const isSystem = msg.senderId === 'system';
          const prevMsg = displayedMessages[index - 1];
          const isNewDay = !prevMsg || new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();
          const senderUser = isGroup ? (groupMembers.find((u) => u.id === msg.senderId) || msg.sender) : (isMe ? currentUser : partner);

          // System message layout
          if (isSystem) {
            return (
              <div key={msg.id} className="flex justify-center my-3">
                <span className="px-3.5 py-1 rounded-full bg-white/10 border border-white/10 text-white/70 text-[11px] shadow-sm backdrop-blur-md">
                  {msg.text}
                </span>
              </div>
            );
          }

          return (
            <div key={msg.id} className="space-y-3">
              {isNewDay && (
                <div className="flex items-center justify-center my-4">
                  <span className="px-3.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/40 text-[11px] shadow-sm">
                    {formatDateLabel(msg.createdAt)}
                  </span>
                </div>
              )}

              <div className={`flex gap-2.5 group items-end ${isMe ? 'justify-end' : 'justify-start'}`}>
                
                {/* Other User Avatar in Group Chat or 1:1 */}
                {!isMe && (
                  <div className="shrink-0 mb-1">
                    <div className={`w-8 h-8 rounded-xl bg-gradient-to-tr ${senderUser?.avatarBg || 'from-indigo-500 to-blue-600'} border border-white/15 flex items-center justify-center text-sm shadow-sm`}>
                      {senderUser?.avatarEmoji || '👤'}
                    </div>
                  </div>
                )}

                <div className={`flex flex-col max-w-[80%] sm:max-w-[70%] md:max-w-[60%] ${isMe ? 'items-end' : 'items-start'}`}>
                  
                  {/* Sender Name in Group Chat */}
                  {!isMe && isGroup && (
                    <div className="flex items-center gap-1.5 mb-1 px-1">
                      <span className="text-xs font-bold text-white/90">
                        {senderUser?.name || msg.sender?.name || '멤버'}
                      </span>
                      <span className="text-[10px] text-blue-400 font-mono">
                        @{senderUser?.username || msg.sender?.username}
                      </span>
                    </div>
                  )}

                  {/* Reply Header */}
                  {msg.replyTo && (
                    <div className="mb-1 px-3 py-1 bg-white/10 border border-white/10 rounded-xl text-[11px] text-white/70 max-w-full truncate backdrop-blur-md">
                      <span className="font-semibold text-blue-300 mr-1">
                        @{msg.replyTo.senderName}
                      </span>
                      <span className="truncate">{msg.replyTo.text}</span>
                    </div>
                  )}

                  {/* Message Bubble Container */}
                  <div className="relative group/bubble">
                    
                    <div
                      className={`p-3.5 rounded-3xl backdrop-blur-xl border transition-all text-sm leading-relaxed ${
                        isMe
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-none border-blue-400/30 shadow-lg shadow-blue-600/15'
                          : 'bg-[#181d2c]/90 text-white/90 rounded-tl-none border-white/10 shadow-md'
                      }`}
                    >
                      {/* Attachment Rendering */}
                      {msg.attachment && (
                        <div className="mb-2.5">
                          {/* Image Attachment */}
                          {msg.attachment.type === 'image' && (
                            <div className="space-y-1.5">
                              <div
                                onClick={() => setPreviewImage(msg.attachment!.url)}
                                className="relative rounded-2xl overflow-hidden cursor-zoom-in group/img border border-white/15 bg-black/30 max-h-72 flex items-center justify-center"
                              >
                                <img
                                  src={msg.attachment.url}
                                  alt={msg.attachment.name}
                                  className="max-h-72 w-full object-contain hover:scale-105 transition-transform duration-200"
                                />
                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                  <span className="p-2 bg-black/60 rounded-full text-white text-xs flex items-center gap-1">
                                    <Eye className="w-3.5 h-3.5" /> 크게보기
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-[11px] text-white/60 px-1">
                                <span className="truncate max-w-[180px]">{msg.attachment.name}</span>
                                <a
                                  href={msg.attachment.url}
                                  download={msg.attachment.name}
                                  className="p-1 hover:text-white flex items-center gap-1 text-blue-300"
                                  title="다운로드"
                                >
                                  <Download className="w-3.5 h-3.5" /> 저장
                                </a>
                              </div>
                            </div>
                          )}

                          {/* Video Attachment */}
                          {msg.attachment.type === 'video' && (
                            <div className="space-y-1.5">
                              <div className="rounded-2xl overflow-hidden border border-white/15 bg-black/40">
                                <video
                                  src={msg.attachment.url}
                                  controls
                                  className="max-h-64 w-full rounded-2xl"
                                />
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-white/60 px-1">
                                <span className="truncate max-w-[180px]">{msg.attachment.name}</span>
                                <a
                                  href={msg.attachment.url}
                                  download={msg.attachment.name}
                                  className="p-1 hover:text-white flex items-center gap-1 text-blue-300"
                                >
                                  <Download className="w-3.5 h-3.5" /> 저장
                                </a>
                              </div>
                            </div>
                          )}

                          {/* Audio Attachment */}
                          {msg.attachment.type === 'audio' && (
                            <div className="p-2.5 rounded-2xl bg-black/30 border border-white/10 space-y-2">
                              <div className="flex items-center gap-2">
                                <Music className="w-4 h-4 text-emerald-400 shrink-0" />
                                <span className="text-xs font-semibold text-white truncate flex-1">
                                  {msg.attachment.name}
                                </span>
                              </div>
                              <audio
                                src={msg.attachment.url}
                                controls
                                className="w-full h-8"
                              />
                            </div>
                          )}

                          {/* Document or General File */}
                          {(msg.attachment.type === 'document' || msg.attachment.type === 'file') && (
                            <a
                              href={msg.attachment.url}
                              download={msg.attachment.name}
                              target="_blank"
                              rel="noreferrer"
                              className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                                isMe
                                  ? 'bg-white/15 border-white/20 hover:bg-white/20 text-white'
                                  : 'bg-black/30 border-white/10 hover:bg-black/40 text-white'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="p-2 rounded-xl bg-white/10 shrink-0">
                                  {renderAttachmentIcon(msg.attachment.type, msg.attachment.name)}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold truncate max-w-[180px]">
                                    {msg.attachment.name}
                                  </p>
                                  <p className="text-[10px] text-white/50">
                                    {msg.attachment.size || '파일 다운로드'}
                                  </p>
                                </div>
                              </div>

                              <div className="p-2 rounded-xl bg-white/10 hover:bg-white/20 shrink-0 text-white flex items-center gap-1 text-xs">
                                <Download className="w-4 h-4" />
                              </div>
                            </a>
                          )}
                        </div>
                      )}

                      {/* Text content */}
                      {msg.text && (
                        <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                      )}
                    </div>

                    {/* Hover Reaction Toolbar */}
                    <div
                      className={`absolute top-0 opacity-0 group-hover/bubble:opacity-100 transition-opacity flex items-center gap-1 bg-[#121622]/95 border border-white/15 px-2 py-1 rounded-2xl shadow-xl backdrop-blur-xl z-10 ${
                        isMe ? 'right-full mr-2' : 'left-full ml-2'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onReactMessage(msg.id, '❤️')}
                        className="hover:scale-125 transition-transform text-xs p-1"
                        title="하트"
                      >
                        ❤️
                      </button>
                      <button
                        type="button"
                        onClick={() => onReactMessage(msg.id, '👍')}
                        className="hover:scale-125 transition-transform text-xs p-1"
                        title="좋아요"
                      >
                        👍
                      </button>
                      <button
                        type="button"
                        onClick={() => onReactMessage(msg.id, '🔥')}
                        className="hover:scale-125 transition-transform text-xs p-1"
                        title="불꽃"
                      >
                        🔥
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setReplyingTo({
                            id: msg.id,
                            senderName: senderUser?.name || '멤버',
                            text: msg.text || (msg.attachment ? `[파일] ${msg.attachment.name}` : ''),
                          })
                        }
                        className="text-white/60 hover:text-white p-1 hover:bg-white/10 rounded-lg transition-colors"
                        title="답장하기"
                      >
                        <Reply className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg.id, msg.text || msg.attachment?.url || '')}
                        className="text-white/60 hover:text-white p-1 hover:bg-white/10 rounded-lg transition-colors"
                        title="복사"
                      >
                        {copiedMsgId === msg.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                  </div>

                  {/* Reactions List */}
                  {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries(msg.reactions).map(([emoji, userList]) => {
                        const users = Array.isArray(userList) ? (userList as string[]) : [];
                        const hasReacted = users.includes(currentUser.id);
                        return (
                          <button
                            key={emoji}
                            onClick={() => onReactMessage(msg.id, emoji)}
                            className={`px-2 py-0.5 rounded-full text-[11px] flex items-center gap-1 border transition-all ${
                              hasReacted
                                ? 'bg-indigo-500/30 border-indigo-400/40 text-white font-bold'
                                : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                            }`}
                          >
                            <span>{emoji}</span>
                            <span>{users.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Timestamp & Read Status */}
                  <div className={`flex items-center gap-1.5 mt-1 text-[10px] text-white/40 ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <span>{formatMessageTime(msg.createdAt)}</span>
                    {isMe && (
                      <span className="flex items-center">
                        {isGroup ? (
                          <span className="text-[10px] text-indigo-300">
                            {msg.readBy && msg.readBy.length > 1 ? `읽음 ${msg.readBy.length - 1}` : '전송됨'}
                          </span>
                        ) : msg.read ? (
                          <CheckCheck className="w-3.5 h-3.5 text-blue-400" title="상대방이 읽음" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-white/40" title="전송 완료" />
                        )}
                      </span>
                    )}
                  </div>

                </div>

              </div>

            </div>
          );
        })}

        {/* Typing indicator bubble in bottom */}
        {isPartnerTyping && !isGroup && partner && (
          <div className="flex gap-2.5 items-end justify-start animate-in fade-in duration-200">
            <div className={`w-8 h-8 rounded-xl bg-gradient-to-tr ${partner.avatarBg || 'from-blue-500 to-purple-500'} border border-white/10 flex items-center justify-center text-sm shadow-sm shrink-0 mb-1`}>
              {partner.avatarEmoji || '💬'}
            </div>
            <div className="px-4 py-2.5 rounded-2xl bg-white/10 border border-white/10 text-white/80 rounded-tl-none flex items-center gap-1.5 text-xs backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:0.4s]" />
              <span className="ml-1 text-[11px] text-white/90 font-medium">{partner.username}이 입력 중입니다...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Reply Banner */}
      {replyingTo && (
        <div className="px-4 py-2 bg-black/30 backdrop-blur-md border-t border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs min-w-0">
            <Reply className="w-4 h-4 text-indigo-400 shrink-0" />
            <div className="min-w-0">
              <span className="font-semibold text-indigo-400">
                {replyingTo.senderName}
              </span>
              <span className="text-white/60 ml-1.5 truncate">
                {replyingTo.text}
              </span>
            </div>
          </div>
          <button
            id="cancel-reply-btn"
            type="button"
            onClick={() => setReplyingTo(null)}
            className="text-white/50 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pending File Attachment Preview Banner */}
      {pendingAttachment && (
        <div className="px-4 py-2.5 bg-indigo-950/60 backdrop-blur-xl border-t border-indigo-500/20 flex items-center justify-between animate-in slide-in-from-bottom-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-white/10 rounded-xl shrink-0">
              {renderAttachmentIcon(pendingAttachment.type, pendingAttachment.name)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white truncate max-w-[200px]">
                  {pendingAttachment.name}
                </span>
                <span className="text-[10px] bg-indigo-500/30 text-indigo-300 px-1.5 py-0.2 rounded border border-indigo-400/30">
                  {pendingAttachment.type.toUpperCase()}
                </span>
              </div>
              <p className="text-[10px] text-white/50">
                {pendingAttachment.size || '첨부 대기 중'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPendingAttachment(null)}
            className="text-white/50 hover:text-white p-1.5 hover:bg-white/10 rounded-xl"
            title="첨부 취소"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Upload Error Banner */}
      {uploadError && (
        <div className="px-4 py-2 bg-rose-500/20 border-t border-rose-500/30 flex items-center justify-between text-xs text-rose-300">
          <span>{uploadError}</span>
          <button onClick={() => setUploadError(null)} className="text-rose-300 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Emoji Picker Popup */}
      {showEmojiPicker && (
        <div className="absolute bottom-24 left-4 z-20 p-3 bg-[#121622]/95 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-150">
          <div className="text-xs font-semibold text-white/50 mb-2 px-1">
            빠른 이모지
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {COMMON_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                id={`picker-emoji-${emoji}`}
                type="button"
                onClick={() => {
                  setInputText((prev) => prev + emoji);
                  setShowEmojiPicker(false);
                  textareaRef.current?.focus();
                }}
                className="w-8 h-8 rounded-xl hover:bg-white/10 text-lg flex items-center justify-center transition-transform hover:scale-125"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick Stickers Popup */}
      {showStickerMenu && (
        <div className="absolute bottom-24 left-12 z-20 p-3 bg-[#121622]/95 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-2xl w-64 animate-in fade-in zoom-in-95 duration-150">
          <div className="text-xs font-semibold text-white/50 mb-2 px-1 flex items-center justify-between">
            <span>자주 쓰는 메시지</span>
            <button onClick={() => setShowStickerMenu(false)} className="text-white/40 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1">
            {QUICK_STICKERS.map((stk, idx) => (
              <button
                key={idx}
                id={`preset-sticker-btn-${idx}`}
                type="button"
                onClick={() => {
                  onSendMessage(stk, replyingTo || undefined);
                  setReplyingTo(null);
                  setShowStickerMenu(false);
                }}
                className="w-full text-left p-2 hover:bg-white/10 rounded-xl text-xs text-white/90 transition-colors truncate"
              >
                {stk}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Message Input Bottom Bar */}
      <footer className="p-3 sm:p-4 md:p-5 bg-black/20 border-t border-white/10 backdrop-blur-xl shrink-0">
        <form onSubmit={handleSend} className="flex items-center gap-2 sm:gap-3 bg-white/5 border border-white/10 rounded-2xl p-2 focus-within:border-indigo-400/40 focus-within:ring-1 focus-within:ring-indigo-500/30 transition-all backdrop-blur-sm">
          
          {/* Action buttons on left */}
          <div className="flex items-center gap-0.5 shrink-0">
            {/* Attachment Button */}
            <button
              id="file-attachment-btn"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              title="파일 첨부 (문서, 영상, 압축파일 등)"
            >
              {isUploading ? (
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
              ) : (
                <Paperclip className="w-5 h-5" />
              )}
            </button>

            {/* Quick Image Button */}
            <button
              id="image-attachment-btn"
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={isUploading}
              className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              title="사진/이미지 첨부"
            >
              <ImageIcon className="w-5 h-5" />
            </button>

            {/* Emoji Picker Button */}
            <button
              id="emoji-picker-btn"
              type="button"
              onClick={() => {
                setShowEmojiPicker(!showEmojiPicker);
                setShowStickerMenu(false);
              }}
              className={`p-2 rounded-xl text-white/50 hover:text-white transition-colors ${
                showEmojiPicker ? 'bg-white/10 text-indigo-400' : 'hover:bg-white/5'
              }`}
              title="이모지 선택"
            >
              <Smile className="w-5 h-5" />
            </button>

            {/* Quick Sticker Button */}
            <button
              id="quick-sticker-menu-btn"
              type="button"
              onClick={() => {
                setShowStickerMenu(!showStickerMenu);
                setShowEmojiPicker(false);
              }}
              className={`hidden sm:flex p-2 rounded-xl text-white/50 hover:text-white transition-colors ${
                showStickerMenu ? 'bg-white/10 text-indigo-400' : 'hover:bg-white/5'
              }`}
              title="자주 쓰는 메시지"
            >
              <Sparkles className="w-5 h-5" />
            </button>
          </div>

          {/* Text Area */}
          <div className="flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              id="chat-message-input"
              rows={1}
              value={inputText}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              placeholder={
                isGroup
                  ? `${group?.name || '단체방'}에 메시지 또는 파일 보내기...`
                  : `@${partner?.username || '친구'} 님에게 메시지 또는 파일 보내기...`
              }
              className="w-full px-2 py-1.5 bg-transparent border-none text-white placeholder-white/30 text-sm focus:outline-none resize-none max-h-32 leading-relaxed"
            />
          </div>

          {/* Send Button */}
          <button
            id="send-message-btn"
            type="submit"
            disabled={(!inputText.trim() && !pendingAttachment) || isUploading}
            className="p-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 active:scale-95 disabled:opacity-40 disabled:hover:from-indigo-600 disabled:hover:to-blue-600 text-white rounded-xl shadow-lg shadow-indigo-600/30 border border-indigo-400/30 transition-all shrink-0"
            title="전송"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </footer>

    </main>
  );
};
