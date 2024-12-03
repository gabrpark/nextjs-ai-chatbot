'use client';

import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { type User } from 'next-auth';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

import {
  InfoIcon,
  MoreHorizontalIcon,
  TrashIcon,
} from '@/components/custom/icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Chat } from '@/db/schema';
import { fetcher, getTitleFromChat } from '@/lib/utils';

function ChatMenuItem({
  chat,
  isActive,
  onDelete,
  onMobileClose
}: {
  chat: Chat;
  isActive: boolean;
  onDelete: (chatId: string) => void;
  onMobileClose: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive}>
        <Link href={`/chat/${chat.id}`} onClick={onMobileClose}>
          <span>{getTitleFromChat(chat)}</span>
        </Link>
      </SidebarMenuButton>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            showOnHover={!isActive}
          >
            <MoreHorizontalIcon />
            <span className="sr-only">More</span>
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="bottom"
          align="end"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DropdownMenuItem
            className="text-destructive focus:bg-destructive/15 focus:text-destructive"
            onClick={() => {
              setIsOpen(false);
              onDelete(chat.id);
            }}
          >
            <TrashIcon />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

export function SidebarHistory({ user }: { user: User | undefined }) {
  const { setOpenMobile } = useSidebar();
  const { id } = useParams();
  const pathname = usePathname();
  const {
    data: history,
    isLoading,
    mutate,
  } = useSWR<Array<Chat>>(user ? '/api/history' : null, fetcher, {
    fallbackData: [],
  });

  useEffect(() => {
    mutate();
  }, [pathname, mutate]);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const router = useRouter();
  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      // First, close the dialog
      setShowDeleteDialog(false);

      // If we're deleting the current chat, navigate first
      if (deleteId === id) {
        await router.push('/');
      }

      const response = await fetch(`/api/chat?id=${deleteId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete chat');
      }

      // Update the local state
      await mutate(
        (currentHistory) => currentHistory?.filter((h) => h.id !== deleteId) ?? [],
        {
          optimisticData: (currentHistory) =>
            currentHistory?.filter((h) => h.id !== deleteId) ?? [],
          revalidate: true,
          rollbackOnError: true
        }
      );

      toast.success('Chat deleted successfully');
    } catch (error) {
      console.error('Delete chat error:', error);
      toast.error('Failed to delete chat');
    }
  };

  const handleDeleteTrigger = (chatId: string) => {
    setDeleteId(chatId);
    setShowDeleteDialog(true);
  };

  if (!user) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>History</SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="text-zinc-500 h-dvh w-full flex flex-row justify-center items-center text-sm gap-2">
            <InfoIcon />
            <div>Login to save and revisit previous chats!</div>
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (isLoading) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>History</SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="flex flex-col">
            {[44, 32, 28, 64, 52].map((item) => (
              <div
                key={item}
                className="rounded-md h-8 flex gap-2 px-2 items-center"
              >
                <div
                  className="h-4 rounded-md flex-1 max-w-[--skeleton-width] bg-sidebar-accent-foreground/10"
                  style={
                    {
                      '--skeleton-width': `${item}%`,
                    } as React.CSSProperties
                  }
                />
              </div>
            ))}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (history?.length === 0) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>History</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton>
                <InfoIcon />
                <span>No chats found</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>History</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {history?.map((chat) => (
              <ChatMenuItem
                key={chat.id}
                chat={chat}
                isActive={chat.id === id}
                onDelete={handleDeleteTrigger}
                onMobileClose={() => setOpenMobile(false)}
              />
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your
              chat and remove it from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
