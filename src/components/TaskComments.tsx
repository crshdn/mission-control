'use client';

import { useEffect, useState, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { MessageCircle, AlertTriangle } from 'lucide-react';
import type { TaskComment } from '@/lib/types';

interface TaskCommentsProps {
  taskId: string;
}

export function TaskComments({ taskId }: TaskCommentsProps) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(true);

  const loadComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`);
      if (res.ok) setComments(await res.json());
    } catch (error) {
      console.error('Failed to load comments:', error);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    loadComments();
    const interval = setInterval(loadComments, 10000);
    return () => clearInterval(interval);
  }, [loadComments]);

  if (loading) {
    return <div className="flex items-center justify-center py-8 text-mc-text-secondary text-sm">Loading comments...</div>;
  }

  if (comments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-mc-text-secondary">
        <MessageCircle className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No comments</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {comments.map((comment) => (
        <CommentItem key={comment.id} comment={comment} />
      ))}
    </div>
  );
}

function CommentItem({ comment }: { comment: TaskComment }) {
  return (
    <div className={`rounded-lg p-3 ${comment.is_rejection ? 'bg-mc-accent-red/5 border border-mc-accent-red/20' : 'bg-mc-bg border border-mc-border'}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {comment.author ? (
            <>
              <span className="text-base">{comment.author.avatar_emoji}</span>
              <span className="text-sm font-medium">{comment.author.name}</span>
            </>
          ) : (
            <span className="text-sm text-mc-text-secondary">Unknown</span>
          )}
          {comment.is_rejection && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-mc-accent-red/20 text-mc-accent-red text-xs rounded-full">
              <AlertTriangle className="w-3 h-3" />
              Rejection
            </span>
          )}
        </div>
        <span className="text-xs text-mc-text-secondary">
          {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
        </span>
      </div>
      <p className="text-sm text-mc-text whitespace-pre-wrap">{comment.content}</p>
      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-3 space-y-2 ml-4 pl-3 border-l-2 border-mc-border">
          {comment.replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} />
          ))}
        </div>
      )}
    </div>
  );
}
