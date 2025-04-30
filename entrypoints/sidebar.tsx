import React, {useState} from "react";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";
import {IoMdCloseCircle} from "react-icons/io";
import {IoIosSettings} from "react-icons/io";
import {RiDashboardFill} from "react-icons/ri";

export enum SidebarType {
    'home' = 'home',
    'settings' = 'settings',
    'drive' = 'drive',
}

const Sidebar = (
    {sideNav, closeContent}: {
        sideNav: (sidebarType: SidebarType) => void,
        closeContent?: () => void
    }) => {
    const [sidebarType, setSidebarType] = useState<SidebarType>(SidebarType.home);

    return (
        <aside
            className="absolute inset-y-0 right-0 z-101 flex w-14 flex-col border-r bg-background border-l-[1px]">
            {closeContent && <a
                className="hover:cursor-pointer flex h-9 w-9 items-center justify-center  text-muted-foreground transition-colors hover:text-foreground ml-auto mr-auto"
                href="#" onClick={() => {
                closeContent()
            }}
            >
                <IoMdCloseCircle className="h-4 w-4 transition-all group-hover:scale-110"/>
                <span className="sr-only">close sidebar</span>
            </a>
            }
            <nav className="flex flex-col items-center gap-4 px-2 py-5">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <a
                                className={`hover:cursor-pointer flex h-9 w-9 items-center justify-center  text-muted-foreground transition-colors ${sidebarType == SidebarType.home ? "rounded-full bg-primary text-lg font-semibold text-primary-foreground" : ""}`}
                                href="#" onClick={() => {
                                setSidebarType(SidebarType.home)
                                sideNav(SidebarType.home)
                            }}
                            >
                                <RiDashboardFill
                                    className={`h-4 w-4 transition-all group-hover:scale-110`}/>
                                <span className="sr-only">home</span>
                            </a>
                        </TooltipTrigger>
                        <TooltipContent side="right">home</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                {/* Google Drive Folder Button (now sets sidebarType to 'drive') */}
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <a
                                className={`hover:cursor-pointer flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors ${sidebarType == SidebarType.drive ? "rounded-full bg-primary text-lg font-semibold text-primary-foreground" : ""}`}
                                href="#" onClick={() => {
                                    setSidebarType(SidebarType.drive);
                                    sideNav(SidebarType.drive);
                                }}
                            >
                                {/* Simple folder SVG icon */}
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h3.172a1.5 1.5 0 0 1 1.06.44l1.828 1.828A1.5 1.5 0 0 0 11.12 7H16a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 16 17H4A1.5 1.5 0 0 1 2.5 15.5v-10Z" stroke="currentColor" strokeWidth="1.5"/>
                                </svg>
                                <span className="sr-only">Open Drive Environment</span>
                            </a>
                        </TooltipTrigger>
                        <TooltipContent side="right">Drive Environment</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </nav>
            <nav className="mt-auto flex flex-col items-center gap-4 px-2 py-5">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <a
                                className={`hover:cursor-pointer flex h-9 w-9 items-center justify-center  text-muted-foreground transition-colors ${sidebarType == SidebarType.settings ? "rounded-full bg-primary text-lg font-semibold text-primary-foreground" : ""} `}
                                href="#" onClick={() => {
                                setSidebarType(SidebarType.settings)
                                sideNav(SidebarType.settings)
                            }}
                            >
                                <IoIosSettings
                                    className={`h-5 w-5`}/>
                                <span className="sr-only">Settings</span>
                            </a>
                        </TooltipTrigger>
                        <TooltipContent side="right">Settings</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </nav>
        </aside>);
};

export default Sidebar;


