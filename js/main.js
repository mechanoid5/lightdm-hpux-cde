"use strict";
(function () {
    var username, password, passwordLabel, messages, ok, menu, dialog;
    var active = false;
    var waitingPrompt = false;
    var cachedPassword = null;
    var firstSecret = true;
    var dialogAction = null;
    var previousFocus = null;

    function hasLightDM() {
        return typeof window.lightdm !== "undefined";
    }
    function clearMessages() {
        messages.textContent = "";
    }
    function message(text, type) {
        if (!text || !messages) return;
        var item = document.createElement("li");
        item.textContent = String(text);
        if (type === "error") item.className = "error";
        messages.appendChild(item);
        while (messages.children.length > 3) {
            messages.removeChild(messages.firstChild);
        }
    }
    function idle() {
        active = false;
        waitingPrompt = false;
        cachedPassword = null;
        username.disabled = false;
        password.disabled = false;
        ok.disabled = false;
        password.type = "password";
        passwordLabel.textContent = "Password:";
    }
    function resetLogin() {
        var cancel = active;
        idle();
        clearMessages();
        if (hasLightDM() && cancel) {
            try { lightdm.cancel_authentication(); }
            catch (error) { message("Unable to cancel authentication.", "error"); }
        }
        username.value = "";
        password.value = "";
        username.focus();
    }
    function sendResponse(value) {
        waitingPrompt = false;
        password.value = "";
        password.disabled = true;
        ok.disabled = true;
        try { lightdm.respond(value); }
        catch (error) {
            idle();
            message("Unable to send authentication response.", "error");
        }
    }
    function handleInput(event) {
        event.preventDefault();
        if (!dialog.hidden) return;
        if (!hasLightDM()) {
            clearMessages();
            message("Preview only: LightDM is not available in this browser.", "error");
            return;
        }
        if (active) {
            if (waitingPrompt) sendResponse(password.value);
            return;
        }
        var name = username.value.trim();
        if (!name) { username.focus(); return; }
        clearMessages();
        cachedPassword = password.value;
        password.value = "";
        firstSecret = true;
        active = true;
        waitingPrompt = false;
        username.disabled = true;
        password.disabled = true;
        ok.disabled = true;
        try { lightdm.authenticate(name); }
        catch (error) {
            idle();
            message("Unable to start authentication.", "error");
            password.focus();
        }
    }
    window.show_prompt = function (text, type) {
        if (!active) return;
        waitingPrompt = true;
        if (type === "password" && firstSecret) {
            firstSecret = false;
            if (cachedPassword !== null && cachedPassword !== "") {
                var secret = cachedPassword;
                cachedPassword = null;
                sendResponse(secret);
                return;
            }
        }
        cachedPassword = null;
        password.type = type === "password" ? "password" : "text";
        passwordLabel.textContent = type === "password" ? "Password:" : "Response:";
        clearMessages();
        message(text || "Enter your response.", "info");
        password.disabled = false;
        ok.disabled = false;
        password.value = "";
        if (dialog.hidden) password.focus();
    };
    window.show_message = function (text, type) { message(text, type); };
    window.authentication_complete = function () {
        if (!active) return;
        cachedPassword = null;
        password.value = "";
        waitingPrompt = false;
        if (!lightdm.is_authenticated) {
            idle();
            clearMessages();
            message("Login incorrect. Please try again.", "error");
            if (dialog.hidden) password.focus();
            return;
        }
        clearMessages();
        message("Starting desktop session...", "info");
        try {
            var started = lightdm.start_session_sync();
            if (started === false) {
                idle();
                message("Unable to start the default desktop session.", "error");
            }
        } catch (error) {
            idle();
            message("Unable to start the default desktop session.", "error");
        }
    };
    function closeMenu() {
        menu.hidden = true;
        document.getElementById("options").setAttribute("aria-expanded", "false");
    }
    function closeDialog() {
        dialog.hidden = true;
        dialogAction = null;
        if (previousFocus && !previousFocus.disabled) previousFocus.focus();
        else document.getElementById("help").focus();
    }
    function openDialog(title, text, action) {
        previousFocus = document.activeElement;
        closeMenu();
        document.getElementById("dialog-title").textContent = title;
        document.getElementById("dialog-text").textContent = text;
        dialogAction = action || null;
        document.getElementById("dialog-cancel").hidden = !dialogAction;
        dialog.hidden = false;
        document.getElementById(dialogAction ? "dialog-cancel" : "dialog-confirm").focus();
    }
    function setupPowerButton(id, capability, method, question) {
        var button = document.getElementById(id);
        button.disabled = !hasLightDM() || !lightdm[capability];
        button.addEventListener("click", function () {
            openDialog("System action", question, function () {
                try {
                    var result = lightdm[method]();
                    if (result === false) message("System action failed.", "error");
                } catch (error) { message("System action failed.", "error"); }
            });
        });
    }
    document.addEventListener("DOMContentLoaded", function () {
        username = document.getElementById("username");
        password = document.getElementById("password");
        passwordLabel = document.getElementById("password-label");
        messages = document.getElementById("messages");
        ok = document.getElementById("ok");
        menu = document.getElementById("options-menu");
        dialog = document.getElementById("dialog");
        if (hasLightDM() && lightdm.hostname) {
            document.getElementById("pagetitle").textContent = "Welcome to " + lightdm.hostname;
        }
        document.getElementById("login").addEventListener("submit", handleInput);
        document.getElementById("clear").addEventListener("click", resetLogin);
        document.getElementById("options").addEventListener("click", function () {
            menu.hidden = !menu.hidden;
            this.setAttribute("aria-expanded", menu.hidden ? "false" : "true");
        });
        document.addEventListener("click", function (event) {
            if (!document.querySelector(".options-container").contains(event.target)) closeMenu();
        });
        document.getElementById("help").addEventListener("click", function () {
            openDialog("Desktop Login Help",
                "Enter your login name and password, then press OK.\n\n" +
                "Clear resets the login form.\n\n" +
                "For an additional authentication prompt, enter the requested response " +
                "and press OK again.\n\n" +
                "The system default desktop session will be used.");
        });
        document.getElementById("dialog-confirm").addEventListener("click", function () {
            var action = dialogAction;
            closeDialog();
            if (action) action();
        });
        document.getElementById("dialog-cancel").addEventListener("click", closeDialog);
        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                closeMenu();
                if (!dialog.hidden) closeDialog();
            }
            if (!dialog.hidden && event.key === "Tab") {
                var confirm = document.getElementById("dialog-confirm");
                var cancel = document.getElementById("dialog-cancel");
                event.preventDefault();
                if (cancel.hidden) confirm.focus();
                else if (document.activeElement === confirm) cancel.focus();
                else confirm.focus();
            }
        });
        setupPowerButton("suspend", "can_suspend", "suspend", "Suspend this workstation?");
        setupPowerButton("restart", "can_restart", "restart", "Restart this workstation?");
        setupPowerButton("shutdown", "can_shutdown", "shutdown", "Shut down this workstation?");
        username.focus();
    });
}());
