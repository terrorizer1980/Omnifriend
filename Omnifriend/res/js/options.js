$(document).ready(function() {
    var manif = chrome.runtime.getManifest();
    $("h1").append($("<span/>").text(" " + manif.name)).append($("<small/>").text(" v" + manif.version));
    chrome.storage.local.get(function(store) {
        if (store["em-addresses"] && store["em-addresses"].length) {
            $("#em-status").addClass("alert-success").text(store["em-addresses"].length + " addresses saved.");
        } else {
            $("#em-status").addClass("alert-info").text("Press \"Import\" to open a CSV address book.");
            $("#em-clear").prop("disabled", true);
        }
        $("#em").fadeIn();
        $("#em-import").click(function(e) {
            $("#em-file").click();
        });
        $("#em-file").on("change", function(e) {
            if (!this.files.length) return;
            $("#em-import").prop("disabled", true);
            $("#em-status").removeClass("alert-info alert-danger alert-success").addClass("alert-warning").text("Reading CSV file...");
            var file = this.files[0];
            var reader = new FileReader();
            reader.onload = function(e) {
                var csv = e.target.result;
                try {
                    var contacts = $.csv.toArrays(csv);
                    $("#em-col-name, #em-col-email").empty();
                    var nameSet = false;
                    for (var i in contacts[0]) {
                        var label = contacts[0][i];
                        $("#em-col-name, #em-col-email").append($("<option/>").text(label));
                        if (label.match(/name/gi) && !nameSet) {
                            $("#em-col-name").prop("selectedIndex", i);
                            nameSet = true;
                        }
                        if (label.match(/e-?mail/gi)) $("#em-col-email option:last").prop("selected", true);
                    }
                    $("#em-setup").data("contacts", contacts).modal("show");
                } catch (err) {
                    $("#em-import").prop("disabled", false);
                    $("#em-status").removeClass("alert-warning").addClass("alert-danger").html("Couldn't interpret <code>" + file.name + "</code> as CSV.");
                }
            };
            reader.readAsText(file);
        });
        $("#em-submit").click(function(e) {
            var contacts = $("#em-setup").data("contacts");
            var name = $("#em-col-name").prop("selectedIndex");
            var email = [];
            $("#em-col-email option").each(function(i, opt) {
                if (opt.selected) email.push(i);
            })
            var header = $("#em-row-header").prop("checked");
            var addresses = store["em-addresses"] || [];
            for (var i in contacts) {
                for (var j in email) {
                    var thisName = contacts[i][name];
                    var thisEmail = contacts[i][email[j]];
                    if ((i == 0 && header) || !thisEmail.match(/^[^@]+@[^@]+\.[^@]+$/)) continue;
                    var dupe = false;
                    for (var k in addresses) {
                        if (addresses[k].user.toLowerCase() === thisEmail.toLowerCase()) {
                            dupe = true;
                            break;
                        }
                    }
                    if (!dupe) addresses.push({
                        name: thisName ? thisName : thisEmail,
                        user: thisEmail,
                        url: "mailto:" + thisEmail
                    });
                }
            }
            chrome.storage.local.set({"em-addresses": addresses}, function() {
                $("#em-setup").modal("hide");
                $("#em-import, #em-clear").prop("disabled", false);
                $("#em-status").removeClass("alert-info alert-warning").addClass("alert-success").html(addresses.length + " addresses saved.");
            });
        });
        $("#em-setup").on("hide.bs.modal", function(e) {
            $("#em-import").prop("disabled", false);
            $("#em-file").val("");
            $("#em-row-header").prop("checked", true);
            $("#em-status").removeClass("alert-warning").addClass("alert-info").html("Press \"Import\" to open a CSV address book.");
        });
        $("#em-clear").click(function(e) {
            if (confirm("Remove all cached email addresses?")) {
                $("#em-clear").prop("disabled", true);
                chrome.storage.local.remove("em-addresses", function() {
                    delete store["em-addresses"];
                    $("#em-status").removeClass("alert-danger").addClass("alert-info").text("Press \"Import\" to open a CSV address book.");
                });
            }
        });
        chrome.permissions.contains({
            origins: ["https://www.facebook.com/"]
        }, function(has) {
            if (has) {
                $("#fb-perms").addClass("btn-success").find("span").text("Enabled");
                if (store["fb-friends"] && store["fb-friends"].length) {
                    $("#fb-status").addClass("alert-success").text(store["fb-friends"].length + " friends saved.");
                } else {
                    $("#fb-status").addClass("alert-info").text("Press \"Sync\" to update from Facebook.");
                    $("#fb-clear").prop("disabled", true);
                }
            } else {
                $("#fb-perms").addClass("btn-danger").find("span").text("Disabled");
                $("#fb-sync").prop("disabled", true);
                $("#fb-status").addClass("alert-danger").text("No permissions to get Facebook data.");
            }
            $("#fb").fadeIn();
        });
        $("#fb-perms").click(function(e) {
            if ($("#fb-perms").hasClass("btn-danger")) {
                chrome.permissions.request({
                    origins: ["https://www.facebook.com/"]
                }, function(success) {
                    if (success) {
                        $("#fb-perms").removeClass("btn-danger").addClass("btn-success").find("span").text("Enabled");
                        $("#fb-sync, #fb-opts").prop("disabled", false);
                        $("#fb-status").removeClass("alert-danger").addClass("alert-info").text("Press \"Sync\" to update from Facebook.");
                    }
                });
            } else {
                chrome.permissions.remove({
                    origins: ["https://www.facebook.com/"]
                }, function(success) {
                    if (success) {
                        $("#fb-perms").removeClass("btn-success").addClass("btn-danger").find("span").text("Disabled");
                        $("#fb-sync, #fb-opts").prop("disabled", true);
                        $("#fb-status").removeClass("alert-info").addClass("alert-danger").text("Disabled access to Facebook.  Use \"Clear\" to remove existing friends.");
                    }
                });
            }
        });
        $("#fb-sync").click(function(e) {
            $("#fb-perms, #fb-sync, #fb-opts").prop("disabled", true);
            $("#fb-status").removeClass("alert-info alert-danger alert-success").addClass("alert-warning").text("Looking up user ID...");
            chrome.cookies.get({
                url: "https://www.facebook.com",
                name: "c_user"
            }, function(cookie) {
                if (!cookie) {
                    $("#fb-perms, #fb-sync, #fb-opts").prop("disabled", false);
                    $("#fb-status").removeClass("alert-warning").addClass("alert-danger").text("No cookie found, are you logged in?");
                    return;
                }
                $("#fb-status").text("Fetching friends...");
                $.ajax({
                    url: "https://www.facebook.com/ajax/typeahead/first_degree.php?viewer=" + cookie.value + "&filter[0]=user&__a=1",
                    dataType: "text",
                    success: function(resp, stat, xhr) {
                        resp = JSON.parse(resp.substr(9));
                        var friends = store["fb-friends"] || [];
                        $.each(resp.payload.entries, function(i, friend) {
                            var dupe = false;
                            for (var j in friends) {
                                if (friends[j].id === friend.uid.toString()) {
                                    dupe = true;
                                    break;
                                }
                            }
                            if (!dupe) friends.push({
                                name: friend.names.shift() + (friend.names.length ? " (" + friend.names.join(", ") + ")" : ""),
                                id: friend.uid.toString(),
                                url: "https://www.facebook.com" + friend.path
                            });
                        });
                        chrome.storage.local.set({"fb-friends": friends}, function() {
                            $("#fb-perms, #fb-sync, #fb-opts, #fb-clear").prop("disabled", false);
                            $("#fb-status").removeClass("alert-warning").addClass("alert-success").text(friends.length + " friends saved.");
                        });
                    },
                    error: function(xhr, stat, err) {
                        $("#fb-perms, #fb-sync, #fb-opts").prop("disabled", false);
                        $("#fb-status").removeClass("alert-warning").addClass("alert-danger").text("Failed to get friends.");
                    }
                });
            });
        });
        $("#fb-usernames").click(function(e) {
            e.preventDefault();
            if (!confirm("This may take a while if you have a lot of friends.  Don't close the tab until this completes.")) return;
            $("#fb-status").removeClass("alert-info alert-danger alert-success").addClass("alert-warning");
            var fails = 0;
            function iter(i) {
                if (i >= store["fb-friends"].length) {
                    chrome.storage.local.set({"fb-friends": store["fb-friends"]}, function() {
                        $("#fb-perms, #fb-sync, #fb-opts, #fb-clear").prop("disabled", false);
                        $("#fb-status").removeClass("alert-warning").addClass("alert-success").text("All usernames saved.");
                    });
                    return;
                }
                $("#fb-status").text("Fetching usernames... (" + i + " of " + store["fb-friends"].length
                        + (fails ? ", " + fails + " skipped" : "") + ")");
                var friend = store["fb-friends"][i];
                if (friend.user) return iter(i + 1);
                $.ajax({
                    url: "https://graph.facebook.com/" + friend.id,
                    success: function(resp, stat, err) {
                        friend.user = resp.username;
                        friend.url = "https://www.facebook.com/" + friend.user;
                        iter(i + 1);
                    },
                    error: function(xhr, stat, err) {
                        fails++;
                        iter(i + 1);
                    }
                });
            };
            iter(0);
        });
        $("#fb-clear").click(function(e) {
            if (confirm("Remove all cached Facebook friends?")) {
                $("#fb-clear").prop("disabled", true);
                chrome.storage.local.remove("fb-friends", function() {
                    delete store["fb-friends"];
                    $("#fb-status").removeClass("alert-danger");
                    if ($("#fb-perms").hasClass("btn-danger")) {
                        $("#fb-status").addClass("alert-danger").text("No permissions to get Facebook data.");
                    } else {
                        $("#fb-status").addClass("alert-info").text("Press \"Sync\" to update from Facebook.");
                    }
                });
            }
        });
        chrome.permissions.contains({
            origins: ["https://plus.google.com/"]
        }, function(has) {
            if (has) {
                $("#gp-perms").addClass("btn-success").find("span").text("Enabled");
                if (store["gp-circled"] && store["gp-circled"].length) {
                    $("#gp-status").addClass("alert-success").text(store["gp-circled"].length + " circled users saved.");
                } else {
                    $("#gp-status").addClass("alert-info").text("Press \"Sync\" to update from Google+.");
                    $("#gp-clear").prop("disabled", true);
                }
            } else {
                $("#gp-perms").addClass("btn-danger").find("span").text("Disabled");
                $("#gp-sync, #gp-opts").prop("disabled", true);
                $("#gp-status").addClass("alert-danger").text("No permissions to get Google+ data.");
            }
            $("#gp").fadeIn();
        });
        $("#gp-perms").click(function(e) {
            if ($("#gp-perms").hasClass("btn-danger")) {
                chrome.permissions.request({
                    origins: ["https://plus.google.com/"]
                }, function(success) {
                    if (success) {
                        $("#gp-perms").removeClass("btn-danger").addClass("btn-success").find("span").text("Enabled");
                        $("#gp-sync, #gp-opts").prop("disabled", false);
                        $("#gp-status").removeClass("alert-danger").addClass("alert-info").text("Press \"Sync\" to update from Google+.");
                    }
                });
            } else {
                chrome.permissions.remove({
                    origins: ["https://plus.google.com/"]
                }, function(success) {
                    if (success) {
                        $("#gp-perms").removeClass("btn-success").addClass("btn-danger").find("span").text("Disabled");
                        $("#gp-sync, #gp-opts").prop("disabled", true);
                        $("#gp-status").removeClass("alert-info").addClass("alert-danger").text("Disabled access to Google+.  Use \"Clear\" to remove existing users.");
                    }
                });
            }
        });
        function gpSync(uid) {
            var uidStr = isNaN(parseInt(uid)) ? "" : "/u/" + uid;
            $("#gp-perms, #gp-sync, #gp-opts").prop("disabled", true);
            $("#gp-status").removeClass("alert-info alert-danger alert-success").addClass("alert-warning")
                .text("Looking up username" + (uidStr ? " for user " + uid : "") + "...");
            $.ajax({
                // mobile site loads much faster than desktop
                url: "https://plus.google.com" + uidStr + "/app/basic/home",
                success: function(resp, stat, xhr) {
                    var username = $(".xQ a", resp)[1];
                    if (username) {
                        username = $(username).attr("href").split("/")[uidStr ? 5 : 3];
                        $("#gp-status").text("Fetching circled users...");
                        var circled = store["gp-circled"] || [];
                        $.ajax({
                            url: "https://plus.google.com" + uidStr + "/_/socialgraph/lookup/visible/?o=%5Bnull%2Cnull%2C\"" + username + "\"%5D",
                            dataType: "text",
                            success: function(resp, stat, xhr) {
                                // response contains missing elements (e.g. "a",,,"b"), so fill with null entries
                                resp = resp.substr(6).replace(/,+/g, function(match, offset, string) {
                                    var out = ",";
                                    for (var i = 1; i < match.length; i++) out += "null,";
                                    return out;
                                }).replace(/\[,/g, "[null,").replace(/,\]/g, ",null]");
                                resp = JSON.parse(resp);
                                for (var i in resp[0][2]) {
                                    var user = resp[0][2][i];
                                    var dupe = false;
                                    for (var j in circled) {
                                        if (user[0][2] === circled[j].id) {
                                            dupe = true;
                                            break;
                                        }
                                    }
                                    if (!dupe) circled.push({
                                        name: user[2][0],
                                        id: user[0][2],
                                        url: "https://plus.google.com/" + user[0][2]
                                    });
                                }
                                chrome.storage.local.set({"gp-circled": circled}, function() {
                                    $("#gp-perms, #gp-sync, #gp-opts, #gp-clear").prop("disabled", false);
                                    $("#gp-status").removeClass("alert-warning").addClass("alert-success").text(circled.length + " circled users saved.");
                                });
                            },
                            error: function(xhr, stat, err) {
                                $("#gp-perms, #gp-sync, #gp-opts").prop("disabled", false);
                                $("#gp-status").removeClass("alert-warning").addClass("alert-danger").text("Failed to get users.");
                            }
                        });
                    } else {
                        $("#gp-perms, #gp-sync, #gp-opts").prop("disabled", false);
                        $("#gp-status").removeClass("alert-warning").addClass("alert-danger").text("Failed to get username, are you logged in?");
                    }
                },
                error: function(xhr, stat, err) {
                    $("#gp-perms, #gp-sync, #gp-opts").prop("disabled", false);
                    $("#gp-status").removeClass("alert-warning").addClass("alert-danger").text("Failed to get username, are you logged in?");
                }
            });
        }
        $("#gp-sync").click(function(e) {
            gpSync();
        });
        $("#gp-secondary").click(function(e) {
            e.preventDefault();
            var uid = prompt("Enter the index of the signed in account (appears in various Google URLs as /u/X/ or ?authuser=X).", "0");
            if (!isNaN(parseInt(uid))) gpSync(uid);
        });
        $("#gp-clear").click(function(e) {
            if (confirm("Remove all cached Google+ circles?")) {
                $("#gp-clear").prop("disabled", true);
                chrome.storage.local.remove("gp-circled", function() {
                    delete store["gp-circled"];
                    $("#gp-status").removeClass("alert-danger");
                    if ($("#gp-perms").hasClass("btn-danger")) {
                        $("#gp-status").addClass("alert-danger").text("No permissions to get Google+ data.");
                    } else {
                        $("#gp-status").addClass("alert-info").text("Press \"Sync\" to update from Google+.");
                    }
                });
            }
        });
        chrome.permissions.contains({
            origins: ["https://ssl.reddit.com/"]
        }, function(has) {
            if (has) {
                $("#rd-perms").addClass("btn-success").find("span").text("Enabled");
                if (store["rd-mates"] && store["rd-mates"].length) {
                    $("#rd-status").addClass("alert-success").text(store["rd-mates"].length + " mates saved.");
                } else {
                    $("#rd-status").addClass("alert-info").text("Press \"Sync\" to update from Reddit.");
                    $("#rd-clear").prop("disabled", true);
                }
            } else {
                $("#rd-perms").addClass("btn-danger").find("span").text("Disabled");
                $("#rd-sync").prop("disabled", true);
                $("#rd-status").addClass("alert-danger").text("No permissions to get Reddit data.");
            }
            $("#rd").fadeIn();
        });
        $("#rd-perms").click(function(e) {
            if ($("#rd-perms").hasClass("btn-danger")) {
                chrome.permissions.request({
                    origins: ["https://ssl.reddit.com/"]
                }, function(success) {
                    if (success) {
                        $("#rd-perms").removeClass("btn-danger").addClass("btn-success").find("span").text("Enabled");
                        $("#rd-sync").prop("disabled", false);
                        $("#rd-status").removeClass("alert-danger").addClass("alert-info").text("Press \"Sync\" to update from Reddit.");
                    }
                });
            } else {
                chrome.permissions.remove({
                    origins: ["https://ssl.reddit.com/"]
                }, function(success) {
                    if (success) {
                        $("#rd-perms").removeClass("btn-success").addClass("btn-danger").find("span").text("Disabled");
                        $("#rd-sync").prop("disabled", true);
                        $("#rd-status").removeClass("alert-info").addClass("alert-danger").text("Disabled access to Reddit.  Use \"Clear\" to remove existing mates.");
                    }
                });
            }
        });
        $("#rd-sync").click(function(e) {
            $("#rd-perms, #rd-sync").prop("disabled", true);
            $("#rd-status").removeClass("alert-info alert-danger alert-success").addClass("alert-warning").text("Fetching mates...");
            $.ajax({
                url: "https://ssl.reddit.com/prefs/friends/",
                success: function(resp, stat, xhr) {
                    var mates = store["st-mates"] || [];
                    $(".user", resp).each(function(i, mate) {
                        // remove karma score from label
                        var name = $(mate).text().split("\xA0")[0];
                        var dupe = false;
                        for (var j in mates) {
                            if (mates[j].name === name) {
                                dupe = true;
                                break;
                            }
                        }
                        if (!dupe) mates.push({
                            name: name,
                            url: "https://www.reddit.com/user/" + name
                        });
                    });
                    chrome.storage.local.set({"rd-mates": mates}, function() {
                        $("#rd-perms, #rd-sync, #rd-clear").prop("disabled", false);
                        $("#rd-status").removeClass("alert-warning").addClass("alert-success").text(mates.length + " mates saved.");
                    });
                },
                error: function(xhr, stat, err) {
                    $("#rd-perms, #rd-sync").prop("disabled", false);
                    $("#rd-status").removeClass("alert-warning").addClass("alert-danger").text("Failed to find mates, are you logged in?");
                }
            });
        });
        $("#rd-clear").click(function(e) {
            if (confirm("Remove all cached Reddit mates?")) {
                $("#rd-clear").prop("disabled", true);
                chrome.storage.local.remove("rd-mates", function() {
                    delete store["rd-mates"];
                    $("#rd-status").removeClass("alert-danger");
                    if ($("#rd-perms").hasClass("btn-danger")) {
                        $("#rd-status").addClass("alert-danger").text("No permissions to get Reddit data.");
                    } else {
                        $("#rd-status").addClass("alert-info").text("Press \"Sync\" to update from Reddit.");
                    }
                });
            }
        });
        chrome.permissions.contains({
            origins: ["https://steamcommunity.com/"]
        }, function(has) {
            if (has) {
                $("#st-perms").addClass("btn-success").find("span").text("Enabled");
                if (store["st-friends"] && store["st-friends"].length) {
                    $("#st-status").addClass("alert-success").text(store["st-friends"].length + " friends saved.");
                } else {
                    $("#st-status").addClass("alert-info").text("Press \"Sync\" to update from Steam.");
                    $("#st-clear").prop("disabled", true);
                }
            } else {
                $("#st-perms").addClass("btn-danger").find("span").text("Disabled");
                $("#st-sync").prop("disabled", true);
                $("#st-status").addClass("alert-danger").text("No permissions to get Steam data.");
            }
            $("#st").fadeIn();
        });
        $("#st-perms").click(function(e) {
            if ($("#st-perms").hasClass("btn-danger")) {
                chrome.permissions.request({
                    origins: ["https://steamcommunity.com/"]
                }, function(success) {
                    if (success) {
                        $("#st-perms").removeClass("btn-danger").addClass("btn-success").find("span").text("Enabled");
                        $("#st-sync").prop("disabled", false);
                        $("#st-status").removeClass("alert-danger").addClass("alert-info").text("Press \"Sync\" to update from Steam.");
                    }
                });
            } else {
                chrome.permissions.remove({
                    origins: ["https://steamcommunity.com/"]
                }, function(success) {
                    if (success) {
                        $("#st-perms").removeClass("btn-success").addClass("btn-danger").find("span").text("Disabled");
                        $("#st-sync").prop("disabled", true);
                        $("#st-status").removeClass("alert-info").addClass("alert-danger").text("Disabled access to Steam.  Use \"Clear\" to remove existing friends.");
                    }
                });
            }
        });
        $("#st-sync").click(function(e) {
            $("#st-perms, #st-sync").prop("disabled", true);
            $("#st-status").removeClass("alert-info alert-danger alert-success").addClass("alert-warning").text("Fetching friends...");
            $.ajax({
                url: "https://steamcommunity.com/my/friends",
                success: function(resp, stat, xhr) {
                    var friends = store["st-friends"] || [];
                    $(".friendBlock.persona", resp).each(function(i, friend) {
                        var id = $("input.friendCheckbox", friend).prop("name").slice(8, -1);
                        var dupe = false;
                        for (var j in friends) {
                            if (friends[j].id === id) {
                                dupe = true;
                                break;
                            }
                        }
                        if (dupe) return;
                        var newFriend = {
                            // name field contains child elements and unnecessary spacing
                            name: $("div:nth-of-type(3)", friend).children().remove().end().text().trim(),
                            id: id,
                            url: $("a.friendBlockLinkOverlay", friend).prop("href")
                        };
                        var parts = newFriend.url.split("/");
                        if (parts[parts.length - 2] === "id") newFriend.user = parts[parts.length - 1];
                        friends.push(newFriend);
                    });
                    chrome.storage.local.set({"st-friends": friends}, function() {
                        $("#st-perms, #st-sync, #st-clear").prop("disabled", false);
                        $("#st-status").removeClass("alert-warning").addClass("alert-success").text(friends.length + " friends saved.");
                    });
                },
                error: function(xhr, stat, err) {
                    $("#st-perms, #st-sync").prop("disabled", false);
                    $("#st-status").removeClass("alert-warning").addClass("alert-danger").text("Failed to find friends, are you logged in?");
                }
            });
        });
        $("#st-clear").click(function(e) {
            if (confirm("Remove all cached Steam friends?")) {
                $("#st-clear").prop("disabled", true);
                chrome.storage.local.remove("st-friends", function() {
                    delete store["st-friends"];
                    $("#st-status").removeClass("alert-danger");
                    if ($("#st-perms").hasClass("btn-danger")) {
                        $("#st-status").addClass("alert-danger").text("No permissions to get Steam data.");
                    } else {
                        $("#st-status").addClass("alert-info").text("Press \"Sync\" to update from Steam.");
                    }
                });
            }
        });
        chrome.permissions.contains({
            origins: ["https://twitter.com/"]
        }, function(has) {
            if (has) {
                $("#tw-perms").addClass("btn-success").find("span").text("Enabled");
                if (store["tw-follows"] && store["tw-follows"].length) {
                    $("#tw-status").addClass("alert-success").text(store["tw-follows"].length + " follows saved.");
                } else {
                    $("#tw-status").addClass("alert-info").text("Press \"Sync\" to update from Twitter.");
                    $("#tw-clear").prop("disabled", true);
                }
            } else {
                $("#tw-perms").addClass("btn-danger").find("span").text("Disabled");
                $("#tw-sync").prop("disabled", true);
                $("#tw-status").addClass("alert-danger").text("No permissions to get Twitter data.");
            }
            $("#tw").fadeIn();
        });
        $("#tw-perms").click(function(e) {
            if ($("#tw-perms").hasClass("btn-danger")) {
                chrome.permissions.request({
                    origins: ["https://twitter.com/"]
                }, function(success) {
                    if (success) {
                        $("#tw-perms").removeClass("btn-danger").addClass("btn-success").find("span").text("Enabled");
                        $("#tw-sync").prop("disabled", false);
                        $("#tw-status").removeClass("alert-danger").addClass("alert-info").text("Press \"Sync\" to update from Twitter.");
                    }
                });
            } else {
                chrome.permissions.remove({
                    origins: ["https://twitter.com/"]
                }, function(success) {
                    if (success) {
                        $("#tw-perms").removeClass("btn-success").addClass("btn-danger").find("span").text("Disabled");
                        $("#tw-sync").prop("disabled", true);
                        $("#tw-status").removeClass("alert-info").addClass("alert-danger").text("Disabled access to Twitter.  Use \"Clear\" to remove existing follows.");
                    }
                });
            }
        });
        $("#tw-sync").click(function(e) {
            $("#tw-perms, #tw-sync").prop("disabled", true);
            $("#tw-status").removeClass("alert-info alert-danger alert-success").addClass("alert-warning").text("Looking up username...");
            $.ajax({
                url: "https://twitter.com/settings/account",
                success: function(resp, stat, xhr) {
                    var username = $(".DashboardProfileCard-screennameLink span", resp).text();
                    if (username) {
                        $("#tw-status").text("Fetching followers for " + username + "...");
                        var follows = store["tw-follows"] || [];
                        var dupe = false;
                        for (var i in follows) {
                            if (follows[i].user.toLowerCase() === username.toLowerCase()) {
                                dupe = true;
                                break;
                            }
                        }
                        if (!dupe) follows.push({
                            name: $(".DashboardProfileCard-name a", resp).text(),
                            user: username,
                            url: "https://twitter.com/" + username
                        });
                        function iter(min) {
                            $.ajax({
                                url: "https://twitter.com/" + username + "/following/users?max_position=" + min,
                                success: function(resp, stat, xhr) {
                                    console.log(min, resp);
                                    $(".ProfileNameTruncated-link", resp.items_html).each(function(i, follow) {
                                        var user = follow.href.split("/").pop();
                                        var dupe = false;
                                        for (var j in follows) {
                                            if (follows[j].user.toLowerCase() === user.toLowerCase()) {
                                                dupe = true;
                                                break;
                                            }
                                        }
                                        if (!dupe) follows.push({
                                            name: follow.text.trim(),
                                            user: user,
                                            url: "https://twitter.com/" + user
                                        });
                                    });
                                    if (resp.has_more_items) {
                                        iter(resp.min_position);
                                        $("#tw-status").text("Fetching followers for " + username + "... (" + follows.length + " total)");
                                    } else {
                                        chrome.storage.local.set({"tw-follows": follows}, function() {
                                            $("#tw-perms, #tw-sync, #tw-clear").prop("disabled", false);
                                            $("#tw-status").removeClass("alert-warning").addClass("alert-success").text(follows.length + " follows saved.");
                                        });
                                    }
                                },
                                error: function(xhr, stat, err) {
                                    $("#tw-perms, #tw-sync").prop("disabled", false);
                                    $("#tw-status").removeClass("alert-warning").addClass("alert-danger").text("Failed to get follows.");
                                }
                            });
                        }
                        iter("-1");
                    } else {
                        $("#tw-perms, #tw-sync").prop("disabled", false);
                        $("#tw-status").removeClass("alert-warning").addClass("alert-danger").text("Failed to get username, are you logged in?");
                    }
                },
                error: function(xhr, stat, err) {
                    $("#tw-perms, #tw-sync").prop("disabled", false);
                    $("#tw-status").removeClass("alert-warning").addClass("alert-danger").text("Failed to get username, are you logged in?");
                }
            });
        });
        $("#tw-clear").click(function(e) {
            if (confirm("Remove all cached Twitter follows?")) {
                $("#tw-clear").prop("disabled", true);
                chrome.storage.local.remove("tw-follows", function() {
                    delete store["tw-follows"];
                    $("#tw-status").removeClass("alert-danger");
                    if ($("#tw-perms").hasClass("btn-danger")) {
                        $("#tw-status").addClass("alert-danger").text("No permissions to get Twitter data.");
                    } else {
                        $("#tw-status").addClass("alert-info").text("Press \"Sync\" to update from Twitter.");
                    }
                });
            }
        });
        var searchOpts = {
            fuzzy: true,
            starredOnly: false,
            editControls: true
        };
        store.search = $.extend({}, searchOpts, store.search);
        chrome.storage.local.set({search: store.search});
        $("#search-settings input").each(function(i, input) {
            $(input).prop("checked", store.search[$(this).prop("id").substr(7)]);
        }).change(function(e) {
            store.search[$(this).prop("id").substr(7)] = $(this).prop("checked");
            chrome.storage.local.set({search: store.search});
        });
    });
});
