import * as React from "react";
import {
  Toast as HeroToast,
  toast as heroToast,
} from "@heroui/react";

export interface ToastAddOptions {
  title?: React.ReactNode;
  description?: React.ReactNode;
  type?: 'success' | 'error' | 'warning' | 'info' | 'loading' | string;
  actionProps?: {
    children?: React.ReactNode;
    onClick?: () => void;
    onPress?: () => void;
    variant?: 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger' | 'danger-soft' | 'outline';
  };
  timeout?: number;
  onClose?: () => void;
}

/**
 * HeroUI 原生 Toast Manager / Helper
 * 零自定义 CSS 复写，原生遵循 HeroUI v3 设计规范。
 * 支持 HeroUI 原生调用方式：
 *   toast("message", options)
 *   toast.success("message", options)
 *   toast.danger("message", options)
 *   toast.error("message", options)
 *   toast.warning("message", options)
 *   toast.info("message", options)
 * 兼容现有调用风格：
 *   toast.add({ title, description, type, actionProps })
 */
const toast = Object.assign(
  (message: React.ReactNode, options?: Parameters<typeof heroToast>[1]) => {
    return heroToast(message, options);
  },
  heroToast,
  {
    error: (message: React.ReactNode, options?: Parameters<typeof heroToast.danger>[1]) => {
      return heroToast.danger(message, options);
    },
    add: (options: ToastAddOptions) => {
      const title = options.title ?? '';
      const actionProps = options.actionProps
        ? {
            children: options.actionProps.children,
            onPress: options.actionProps.onPress ?? options.actionProps.onClick,
            variant: options.actionProps.variant ?? ('tertiary' as const),
          }
        : undefined;

      const opts = {
        description: options.description,
        actionProps,
        isLoading: options.type === 'loading',
        timeout: options.timeout,
        onClose: options.onClose,
      };

      switch (options.type) {
        case 'success':
          return heroToast.success(title, opts);
        case 'error':
        case 'danger':
          return heroToast.danger(title, opts);
        case 'warning':
          return heroToast.warning(title, opts);
        case 'info':
          return heroToast.info(title, opts);
        default:
          return heroToast(title, opts);
      }
    },
  }
);

export interface ToasterProps extends React.ComponentProps<typeof HeroToast.Provider> {}

/**
 * HeroUI 原生 Toaster 挂载容器
 * 零自定义 CSS 复写，完全遵循 HeroUI v3 规范
 */
function Toaster({ placement = "bottom end", ...props }: ToasterProps) {
  return <HeroToast.Provider placement={placement} {...props} />;
}

const Toast = Object.assign(HeroToast, {
  Provider: HeroToast.Provider,
  Content: HeroToast.Content,
  Indicator: HeroToast.Indicator,
  Title: HeroToast.Title,
  Description: HeroToast.Description,
  ActionButton: HeroToast.ActionButton,
  CloseButton: HeroToast.CloseButton,
  Queue: HeroToast.Queue,
  toast,
});

const ToastProvider = HeroToast.Provider;
const ToastContent = HeroToast.Content;
const ToastIndicator = HeroToast.Indicator;
const ToastTitle = HeroToast.Title;
const ToastDescription = HeroToast.Description;
const ToastAction = HeroToast.ActionButton;
const ToastActionButton = HeroToast.ActionButton;
const ToastClose = HeroToast.CloseButton;
const ToastCloseButton = HeroToast.CloseButton;

export {
  Toaster,
  Toast,
  ToastProvider,
  ToastContent,
  ToastIndicator,
  ToastTitle,
  ToastDescription,
  ToastAction,
  ToastActionButton,
  ToastClose,
  ToastCloseButton,
  toast,
};
