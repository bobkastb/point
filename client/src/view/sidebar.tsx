// Модуль sidebar.tsx содержит:
//Главное меню
import * as ui from "hyperoop";
import * as svg from "./svg";
import { Link } from "hyperoop-router";

export interface SidebarMenuI {
    Show: boolean;
    Toggle: () => void;
    //SwitchTheme: () => void;
}

const Menu = (a: SidebarMenuI) => (
    a.Show ? 
        <ul class="main-menu-ul">
        <li class={["main-menu-li", window.location.hash.endsWith("camera") ? "main-menu-li-on" : ""].join(" ")}>
            <Link to={"./#camera"}>
                <svg.Camera cls="main-menu-icon"/> Управление камерой
            </Link>
        </li>
        <li class={["main-menu-li", window.location.hash.endsWith("switch") ? "main-menu-li-on" : ""].join(" ")}>
            <Link to={"./#switch"}>
                <svg.Hyperlink cls="main-menu-icon"/> Видео коммутация
            </Link>
        </li>
        <li class={["main-menu-li", window.location.hash.endsWith("capture") ? "main-menu-li-on" : ""].join(" ")}>
            <Link to={"./#capture"}>
                <svg.Selection cls="main-menu-icon"/> Видеозахват
            </Link>
        </li>
        <li class={["main-menu-li", window.location.hash.endsWith("schedule") ? "main-menu-li-on" : ""].join(" ")}>
            <Link to={"./#schedule"}>
                <svg.Clock cls="main-menu-icon"/> Расписания записи
            </Link>
        </li>
        <li class={["main-menu-li", window.location.hash.endsWith("options") ? "main-menu-li-on" : ""].join(" ")}>
            <Link to={"./#options"}>
                <svg.Settings cls="main-menu-icon"/> Настройки
            </Link>
        </li>
        {/*
        <li class="main-menu-li">
        </li>
        <li class="main-menu-li">
            <a href={"./" + window.location.hash} onclick={a.SwitchTheme}>
                <svg.Square cls="switch-theme-icon" width={30}/> Сменить тему
            </a>
        </li>
        */}
        </ul>
    : <ul class="main-menu-ul"></ul>
)

export const Sidebar = (a: SidebarMenuI) => (
    <table class="sidebar-table">
    <tr class="sidebar-top-tr">
        <td class="sidebar-logo-td">{a.Show ? <img src="img/logo.png" class="logo"/> : null}</td>
        <td class="sidebar-control-td" onclick={a.Toggle}>
            <svg.Arrow cls={"sidebar-toggle-icon" + (a.Show ? " sidebar-toggle-hide" : "")}/>
        </td>
    </tr>
    <tr class="sidebar-middle-tr">
        <td colspan="2" class="sidebar-menu-td">
            {Menu(a)}
        </td>
    </tr>
    <tr class="sidebar-bottom-tr">
        <td colspan="2" class="sidebar-footer-td">
            {a.Show ? "Стэл КC 2020г." : null}
        </td>
    </tr>
    </table>
)

//export const SidebarTD = (a: {sidebar: boolean, togglebar: () => {}, rowspan: number, switchtheme: ()=>void}) => (
export const SidebarTD = (a: {sidebar: boolean, togglebar: () => {}, rowspan: number}) => (
    <td rowspan={a.rowspan} class={a.sidebar ? "sidebar-td" : "sidebar-hidden-td"}>
        {/*<Sidebar Show={a.sidebar} Toggle={a.togglebar} SwitchTheme={a.switchtheme}/>*/}
        <Sidebar Show={a.sidebar} Toggle={a.togglebar}/>                
    </td>
)
