/*
 * Mozilla Readability - Adapted for Lensly Chrome Extension
 * Original: https://github.com/mozilla/readability
 * License: Apache-2.0
 */
(function (global) {
  "use strict";

  var REGEXPS = {
    unlikelyCandidates: /-ad-|ai2html|banner|breadcrumbs|combx|comment|community|cover-wrap|disqus|extra|footer|gdpr|header|legends|menu|related|remark|replies|rss|shoutbox|sidebar|skyscraper|social|sponsor|supplemental|ad-break|agegate|pagination|pager|popup|yom-remote/i,
    okMaybeItsACandidate: /and|article|body|column|content|main|shadow/i,
    positive: /article|body|content|entry|hentry|h-entry|main|page|pagination|post|text|blog|story/i,
    negative: /-ad-|hidden|^hid$| hid$| hid |^hid |banner|combx|comment|com-|contact|footer|footnote|gdpr|masthead|media|meta|outbrain|promo|related|scroll|share|shoutbox|sidebar|skyscraper|sponsor|shopping|tags|tool|widget/i,
    extraneous: /print|archive|comment|discuss|e[\-]?mail|share|reply|all|login|sign|single|utility/i,
    byline: /byline|author|dateline|writtenby|p-author/i,
    replaceFonts: /<(\/?)font[^>]*>/gi,
    normalize: /\s{2,}/g,
    videos: /\/\/(www\.)?((dailymotion|youtube|youtube-nocookie|player\.vimeo|v\.qq)\.com|(archive|upload\.wikimedia)\.org|player\.twitch\.tv)/i,
    shareElements: /(\b|_)(share|sharedaddy)(\b|_)/i,
    nextLink: /(next|weiter|continue|>([^\|]|$)|»([^\|]|$))/i,
    prevLink: /(prev|earl|old|new|<|«)/i,
    tokenize: /\W+/g,
    whitespace: /^\s*$/,
    hasContent: /\S$/,
    hashUrl: /^#.+/,
    srcsetUrl: /(\S+)(\s+[\d.]+[xw])?(\s*(?:,|$))/g,
    b64DataUrl: /^data:\s*([^\s;,]+)\s*;\s*base64\s*,/i,
    jsonLdArticleTypes: /^Article|AdvertiserContentArticle|NewsArticle|AnalysisNewsArticle|AskPublicNewsArticle|BackgroundNewsArticle|OpinionNewsArticle|ReportageNewsArticle|ReviewNewsArticle|Report|SatiricalArticle|ScholarlyArticle|MedicalScholarlyArticle|SocialMediaPosting|BlogPosting|LiveBlogPosting|DiscussionForumPosting|TechArticle|APIReference$/,
  };

  var DIV_TO_P_ELEMS = new Set(["BLOCKQUOTE", "DL", "FIGURE", "OL", "TABLE", "UL"]);

  var ALTER_TO_DIV_EXCEPTIONS = ["DIV", "ARTICLE", "SECTION", "P"];

  var PRESENTATIONAL_ATTRIBUTES = ["align", "background", "bgcolor", "border", "cellpadding", "cellspacing", "frame", "hspace", "rules", "style", "valign", "vspace"];

  var DEPRECATED_SIZE_ATTRIBUTE_ELEMS = ["TABLE", "TH", "TD", "HR", "PRE"];

  var PHRASING_ELEMS = ["ABBR", "AUDIO", "B", "BDO", "BR", "BUTTON", "CITE", "CODE", "DATA", "DATALIST", "DFN", "EM", "EMBED", "I", "IMG", "INPUT", "KBD", "LABEL", "MARK", "MATH", "METER", "NOSCRIPT", "OBJECT", "OUTPUT", "PROGRESS", "Q", "RP", "RT", "RUBY", "S", "SAMP", "SELECT", "SMALL", "SPAN", "STRONG", "SUB", "SUP", "TEXTAREA", "TIME", "VAR", "VIDEO", "WBR"];

  var CLASSES_TO_PRESERVE = ["page"];

  var HTML_ESCAPE_MAP = { "lt": "<", "gt": ">", "amp": "&", "quot": "\"", "apos": "'" };

  function Readability(doc, options) {
    if (options && options.documentElement) {
      doc = options;
      options = arguments[2];
    } else if (!doc || !doc.documentElement) {
      throw new Error("First argument to Readability constructor should be a document object.");
    }
    options = options || {};

    this._doc = doc;
    this._docJSDOMParser = this._doc.firstChild && this._doc.firstChild.__JSDOMParser__;
    this._articleTitle = null;
    this._articleByline = null;
    this._articleDir = null;
    this._articleSiteName = null;
    this._attempts = [];
    this._allowedVideoRegex = options.allowedVideoRegex || REGEXPS.videos;
    this._linkDensityModifier = options.linkDensityModifier || 0;
    this._charThreshold = options.charThreshold || 500;
    this._classesToPreserve = CLASSES_TO_PRESERVE.concat(options.classesToPreserve || []);
    this._keepClasses = !!options.keepClasses;
    this._serializer = options.serializer || function (el) { return el.innerHTML; };
    this._disableJSONLD = !!options.disableJSONLD;
    this._htmlparser2 = options.htmlparser2;
    this._flags = 0x1 | 0x2 | 0x4;

    if (options.debug) {
      this._logElement = null;
    }

    this.log = function () {};
  }

  Readability.prototype = {
    FLAG_STRIP_UNLIKELYS: 0x1,
    FLAG_WEIGHT_CLASSES: 0x2,
    FLAG_CLEAN_CONDITIONALLY: 0x4,
    ELEMENT_NODE: 1,
    TEXT_NODE: 3,
    MAX_ELEMS_TO_PARSE: 0,
    N_TOP_CANDIDATES: 5,
    DEFAULT_TAGS_TO_SCORE: "section,h2,h3,h4,h5,h6,p,td,pre".toUpperCase().split(","),
    DEFAULT_CHAR_THRESHOLD: 500,
    REGEXPS: REGEXPS,
    DIV_TO_P_ELEMS: DIV_TO_P_ELEMS,
    ALTER_TO_DIV_EXCEPTIONS: ALTER_TO_DIV_EXCEPTIONS,
    PRESENTATIONAL_ATTRIBUTES: PRESENTATIONAL_ATTRIBUTES,
    DEPRECATED_SIZE_ATTRIBUTE_ELEMS: DEPRECATED_SIZE_ATTRIBUTE_ELEMS,
    PHRASING_ELEMS: PHRASING_ELEMS,
    CLASSES_TO_PRESERVE: CLASSES_TO_PRESERVE,

    _hasFlag: function (flag) { return (this._flags & flag) > 0; },
    _setFlag: function (flag) { this._flags = this._flags | flag; },
    _removeFlag: function (flag) { this._flags = this._flags & ~flag; },

    _isProbablyVisible: function (node) {
      return (!node.style || node.style.display != "none") &&
        (!node.style || node.style.visibility != "hidden") &&
        !node.hasAttribute("hidden") &&
        (!node.hasAttribute("aria-hidden") || node.getAttribute("aria-hidden") != "true");
    },

    _getArticleTitle: function () {
      var doc = this._doc;
      var curTitle = "";
      var origTitle = "";

      try {
        curTitle = origTitle = doc.title.trim();
        if (typeof curTitle !== "string") curTitle = origTitle = this._getInnerText(doc.querySelector("title"));
      } catch (e) {}

      var titleHadHierarchicalSeparators = false;

      function wordCount(str) { return str.split(/\s+/).length; }

      if (/ [\|\-\\\/>»] /.test(curTitle)) {
        titleHadHierarchicalSeparators = / [\\\/>»] /.test(curTitle);
        curTitle = origTitle.replace(/(.*)[\|\-\\\/>»] .*/gi, "$1");
        if (wordCount(curTitle) < 3)
          curTitle = origTitle.replace(/[^\|\-\\\/>»]*[\|\-\\\/>»](.*)/gi, "$1");
      } else if (curTitle.includes(": ")) {
        var headings = Array.from(doc.querySelectorAll("h1, h2"));
        var trimmedTitle = curTitle.trim();
        var match = headings.some(function (heading) {
          return heading.textContent.trim() === trimmedTitle;
        });
        if (!match) {
          curTitle = origTitle.substring(origTitle.lastIndexOf(":") + 1);
          if (wordCount(curTitle) < 3) {
            curTitle = origTitle.substring(origTitle.indexOf(":") + 1);
          } else if (wordCount(origTitle.substr(0, origTitle.indexOf(":"))) > 5) {
            curTitle = origTitle;
          }
        }
      } else if (curTitle.length > 150 || curTitle.length < 15) {
        var hOnes = doc.querySelectorAll("h1");
        if (hOnes.length === 1)
          curTitle = this._getInnerText(hOnes[0]);
      }

      curTitle = this._prepArticle ? curTitle : curTitle.trim().replace(this.REGEXPS.normalize, " ");
      var curTitleWordCount = wordCount(curTitle);
      if (curTitleWordCount <= 4 && (!titleHadHierarchicalSeparators || curTitleWordCount != wordCount(origTitle.replace(/[\|\-\\\/>»]+/g, "")) - 1)) {
        curTitle = origTitle;
      }
      return curTitle;
    },

    _getInnerText: function (e, normalizeSpaces) {
      normalizeSpaces = (typeof normalizeSpaces === "undefined") ? true : normalizeSpaces;
      var textContent = e.textContent.trim();
      if (normalizeSpaces) return textContent.replace(this.REGEXPS.normalize, " ");
      return textContent;
    },

    _getLinkDensity: function (element) {
      var textLength = this._getInnerText(element).length;
      if (textLength === 0) return 0;
      var linkLength = 0;
      var linkNodes = element.querySelectorAll("a");
      Array.from(linkNodes).forEach(function (linkNode) {
        var href = linkNode.getAttribute("href");
        var coefficient = (href && REGEXPS.hashUrl.test(href)) ? 0.3 : 1;
        linkLength += linkNode.textContent.length * coefficient;
      });
      return linkLength / textLength;
    },

    _getNodeAncestors: function (node, maxDepth) {
      maxDepth = maxDepth || 0;
      var i = 0, ancestors = [];
      while (node.parentNode) {
        ancestors.push(node.parentNode);
        if (maxDepth && ++i === maxDepth) break;
        node = node.parentNode;
      }
      return ancestors;
    },

    _getClassWeight: function (e) {
      if (!this._hasFlag(this.FLAG_WEIGHT_CLASSES)) return 0;
      var weight = 0;
      if (typeof (e.className) === "string" && e.className !== "") {
        if (REGEXPS.negative.test(e.className)) weight -= 25;
        if (REGEXPS.positive.test(e.className)) weight += 25;
      }
      if (typeof (e.id) === "string" && e.id !== "") {
        if (REGEXPS.negative.test(e.id)) weight -= 25;
        if (REGEXPS.positive.test(e.id)) weight += 25;
      }
      return weight;
    },

    _initializeNode: function (node) {
      node.readability = { "contentScore": 0 };
      switch (node.tagName) {
        case "DIV": node.readability.contentScore += 5; break;
        case "PRE": case "TD": case "BLOCKQUOTE": node.readability.contentScore += 3; break;
        case "ADDRESS": case "OL": case "UL": case "DL": case "DD": case "DT": case "LI": case "FORM": node.readability.contentScore -= 3; break;
        case "H1": case "H2": case "H3": case "H4": case "H5": case "H6": case "TH": node.readability.contentScore -= 5; break;
      }
      node.readability.contentScore += this._getClassWeight(node);
    },

    _removeAndGetNext: function (node) {
      var nextNode = this._getNextNode(node, true);
      node.parentNode.removeChild(node);
      return nextNode;
    },

    _getNextNode: function (node, ignoreSelfAndKids) {
      if (!ignoreSelfAndKids && node.firstElementChild) return node.firstElementChild;
      if (node.nextElementSibling) return node.nextElementSibling;
      do {
        node = node.parentNode;
      } while (node && !node.nextElementSibling);
      return node && node.nextElementSibling;
    },

    _textSimilarity: function (textA, textB) {
      var tokensA = textA.toLowerCase().split(REGEXPS.tokenize).filter(Boolean);
      var tokensB = new Set(textB.toLowerCase().split(REGEXPS.tokenize).filter(Boolean));
      if (!tokensA.length || !tokensB.size) return 0;
      var tokensInB = tokensA.filter(function (token) { return tokensB.has(token); });
      return 2 * tokensInB.length / (tokensA.length + tokensB.size);
    },

    _checkByline: function (node, matchString) {
      if (this._articleByline) return false;
      var rel = node.getAttribute("rel");
      var itemprop = node.getAttribute("itemprop");
      if ((rel === "author" || (itemprop && itemprop.indexOf("author") !== -1) || REGEXPS.byline.test(matchString)) && this._isValidByline(node.textContent)) {
        this._articleByline = node.textContent.trim();
        return true;
      }
      return false;
    },

    _isValidByline: function (byline) {
      if (typeof byline == "string" || byline instanceof String) {
        byline = byline.trim();
        return (byline.length > 0) && (byline.length < 100);
      }
      return false;
    },

    _grabArticle: function (page) {
      var doc = this._doc;
      var isPaging = !!page;
      page = page || this._doc.body;

      if (!page) { this.log("No body found in document. Abort."); return null; }

      var pageCacheHtml = page.innerHTML;

      while (true) {
        var stripUnlikelyCandidates = this._hasFlag(this.FLAG_STRIP_UNLIKELYS);
        var elementsToScore = [];
        var node = this._doc.documentElement;

        while (node) {
          var matchString = node.className + " " + node.id;

          if (!this._isProbablyVisible(node)) {
            node = this._removeAndGetNext(node);
            continue;
          }

          if (this._checkByline(node, matchString)) {
            node = this._removeAndGetNext(node);
            continue;
          }

          if (stripUnlikelyCandidates) {
            if (REGEXPS.unlikelyCandidates.test(matchString) &&
              !REGEXPS.okMaybeItsACandidate.test(matchString) &&
              !this._hasAncestorTag(node, "table") &&
              !this._hasAncestorTag(node, "code") &&
              node.tagName !== "BODY" &&
              node.tagName !== "A") {
              node = this._removeAndGetNext(node);
              continue;
            }
          }

          if (node.tagName === "DIV") {
            var pCount = node.querySelectorAll("p").length;
            var imgCount = node.querySelectorAll("img").length;
            var liCount = node.querySelectorAll("li").length - 100;
            var inputCount = node.querySelectorAll("input").length;
            var embedCount = node.querySelectorAll("object, embed, iframe").length;

            var contentLength = this._getInnerText(node).length;
            var linkDensity = this._getLinkDensity(node);

            var haveToPChange = pCount > (liCount);

            var shouldDivToPChange = contentLength < 25 && (imgCount === 0 || imgCount > 2) ||
              !haveToPChange ||
              linkDensity > 0.9 ||
              inputCount > (Math.floor(inputCount / 3));

            if (!shouldDivToPChange) {
              var newNode = doc.createElement("p");
              while (node.firstChild) { newNode.appendChild(node.firstChild); }
              node.parentNode.replaceChild(newNode, node);
              node = newNode;
            }
          }

          if (this.DEFAULT_TAGS_TO_SCORE.indexOf(node.tagName) !== -1) {
            elementsToScore.push(node);
          }
          node = this._getNextNode(node);
        }

        var candidates = [];

        elementsToScore.forEach(function (elementToScore) {
          if (!elementToScore.parentNode || typeof (elementToScore.parentNode.tagName) === "undefined") return;

          var innerText = this._getInnerText(elementToScore);
          if (innerText.length < 25) return;

          var ancestors = this._getNodeAncestors(elementToScore, 5);
          if (ancestors.length === 0) return;

          var contentScore = 1;
          contentScore += innerText.split(",").length;
          contentScore += Math.min(Math.floor(innerText.length / 100), 3);

          ancestors.forEach(function (ancestor, level) {
            if (!ancestor.tagName || !ancestor.parentNode || typeof (ancestor.parentNode.tagName) === "undefined") return;
            if (typeof (ancestor.readability) === "undefined") {
              this._initializeNode(ancestor);
              candidates.push(ancestor);
            }
            var scoreDivider;
            if (level === 0) scoreDivider = 1;
            else if (level === 1) scoreDivider = 2;
            else scoreDivider = level * 3;
            ancestor.readability.contentScore += contentScore / scoreDivider;
          }, this);
        }, this);

        var topCandidates = [];
        candidates.forEach(function (c) {
          var candidateScore = c.readability.contentScore * (1 - this._getLinkDensity(c));
          c.readability.contentScore = candidateScore;
          for (var t = 0; t < this.N_TOP_CANDIDATES; t++) {
            var aTopCandidate = topCandidates[t];
            if (!aTopCandidate || candidateScore > aTopCandidate.readability.contentScore) {
              topCandidates.splice(t, 0, c);
              if (topCandidates.length > this.N_TOP_CANDIDATES) topCandidates.pop();
              break;
            }
          }
        }, this);

        var topCandidate = topCandidates[0] || null;
        var neededToCreateTopCandidate = false;

        if (topCandidate === null || topCandidate.tagName === "BODY") {
          topCandidate = doc.createElement("DIV");
          neededToCreateTopCandidate = true;
          while (page.firstChild) { topCandidate.appendChild(page.firstChild); }
          page.appendChild(topCandidate);
          this._initializeNode(topCandidate);
        }

        var articleContent = doc.createElement("DIV");
        articleContent.id = "readability-content";

        var siblingScoreThreshold = Math.max(10, topCandidate.readability.contentScore * 0.2);
        var parentOfTopCandidate = topCandidate.parentNode;
        var siblings = parentOfTopCandidate.children;

        for (var s = 0, sl = siblings.length; s < sl; s++) {
          var sibling = siblings[s];
          var append = false;

          if (sibling === topCandidate) {
            append = true;
          } else if (!append && sibling.readability &&
            sibling.readability.contentScore >= siblingScoreThreshold) {
            append = true;
          } else if (sibling.nodeName === "P") {
            var linkDensity2 = this._getLinkDensity(sibling);
            var nodeContent = this._getInnerText(sibling);
            var nodeLength = nodeContent.length;
            if (nodeLength > 80 && linkDensity2 < 0.25) append = true;
            else if (nodeLength < 80 && nodeLength > 0 && linkDensity2 === 0 && /\.( |$)/.test(nodeContent)) append = true;
          }

          if (append) {
            if (ALTER_TO_DIV_EXCEPTIONS.indexOf(sibling.nodeName) === -1) {
              sibling.nodeName = "DIV";
            }
            articleContent.appendChild(sibling);
            s -= 1;
            sl -= 1;
          }
        }

        this._prepArticle(articleContent);

        if (neededToCreateTopCandidate) {
          topCandidate.id = "readability-page-1";
          topCandidate.className = "page";
        }

        var articleContentLength = this._getInnerText(articleContent).length;

        var parseSuccessful = true;

        if (articleContentLength < this._charThreshold) {
          parseSuccessful = false;
          page.innerHTML = pageCacheHtml;

          if (this._hasFlag(this.FLAG_STRIP_UNLIKELYS)) {
            this._removeFlag(this.FLAG_STRIP_UNLIKELYS);
          } else if (this._hasFlag(this.FLAG_WEIGHT_CLASSES)) {
            this._removeFlag(this.FLAG_WEIGHT_CLASSES);
          } else if (this._hasFlag(this.FLAG_CLEAN_CONDITIONALLY)) {
            this._removeFlag(this.FLAG_CLEAN_CONDITIONALLY);
          } else {
            return null;
          }
        }

        if (parseSuccessful) return articleContent;
      }
    },

    _prepArticle: function (articleContent) {
      this._cleanStyles(articleContent);
      this._markDataTables(articleContent);
      this._fixLazyImages(articleContent);
      this._cleanConditionally(articleContent, "form");
      this._cleanConditionally(articleContent, "fieldset");
      this._clean(articleContent, "object");
      this._clean(articleContent, "embed");
      this._clean(articleContent, "footer");
      this._clean(articleContent, "link");
      this._clean(articleContent, "aside");

      var articleEl = articleContent;
      Array.from(articleEl.children).forEach(function (topLevelNode) {
        this._cleanMatchedNodes(topLevelNode, function (node, matchString) {
          return REGEXPS.shareElements.test(matchString) && node.textContent.length < 500;
        });
      }, this);

      this._clean(articleContent, "iframe");
      this._clean(articleContent, "input");
      this._clean(articleContent, "textarea");
      this._clean(articleContent, "select");
      this._clean(articleContent, "button");
      this._cleanHeaders(articleContent);
      this._cleanConditionally(articleContent, "table");
      this._cleanConditionally(articleContent, "ul");
      this._cleanConditionally(articleContent, "div");

      this._replaceNodeTags(this._getAllNodesWithTag(articleContent, ["h1"]), "h2");

      Array.from(articleContent.querySelectorAll("p")).forEach(function (p) {
        var imgCount = p.querySelectorAll("img").length;
        var embedCount = p.querySelectorAll("embed").length;
        var objectCount = p.querySelectorAll("object").length;
        var iframeCount = p.querySelectorAll("iframe").length;
        var totalCount = imgCount + embedCount + objectCount + iframeCount;

        if (totalCount === 0 && !this._getInnerText(p, false)) this._removeNode(p);
      }, this);

      Array.from(articleContent.querySelectorAll("br")).forEach(function (br) {
        var next = this._nextNode(br.nextSibling);
        if (next && this._hasAncestorTag(next, "p")) this._removeNode(br);
      }, this);

      Array.from(articleContent.querySelectorAll("table")).forEach(function (table) {
        var tbody = this._hasSingleTagInsideElement(table, "TBODY") ? table.firstElementChild : table;
        if (this._hasSingleTagInsideElement(tbody, "TR")) {
          var row = tbody.firstElementChild;
          if (this._hasSingleTagInsideElement(row, "TD")) {
            var cell = row.firstElementChild;
            var newTag = Array.from(cell.childNodes).every(function (n) { return n.nodeType === this.TEXT_NODE; }, this) ? "p" : "div";
            this._setNodeTag(cell, newTag);
            table.parentNode.replaceChild(cell, table);
          }
        }
      }, this);
    },

    _markDataTables: function (root) {
      var tables = root.querySelectorAll("table");
      Array.from(tables).forEach(function (table) {
        var role = table.getAttribute("role");
        if (role == "presentation") { table._readabilityDataTable = false; return; }
        var datatable = table.getAttribute("datatable");
        if (datatable == "0") { table._readabilityDataTable = false; return; }
        var summary = table.getAttribute("summary");
        if (summary) { table._readabilityDataTable = true; return; }
        var caption = table.querySelector("caption");
        if (caption && caption.childNodes.length > 0) { table._readabilityDataTable = true; return; }
        var dataTableDescendants = ["col", "colgroup", "tfoot", "thead", "th"];
        if (dataTableDescendants.some(function (tag) { return !!table.querySelector(tag); })) {
          table._readabilityDataTable = true; return;
        }
        if (table.querySelectorAll("table").length > 0) { table._readabilityDataTable = false; return; }
        var sizeInfo = this._getRowAndColumnCount(table);
        if (sizeInfo.rows >= 10 || sizeInfo.columns > 4) { table._readabilityDataTable = true; return; }
        if (sizeInfo.rows * sizeInfo.columns > 10) { table._readabilityDataTable = true; return; }
      }, this);
    },

    _fixLazyImages: function (root) {
      Array.from(root.querySelectorAll("img, picture, figure")).forEach(function (elem) {
        var src = elem.getAttribute("src");
        var srcset = elem.getAttribute("srcset");
        if ((!src || src === "") && (!srcset || srcset === "")) return;
        if (src && this.REGEXPS.b64DataUrl.test(src)) {
          var parts = this.REGEXPS.b64DataUrl.exec(src);
          if (parts[1] === "image/svg+xml") return;
          var b64starts = src.search(/base64\s*/i) + 7;
          var b64length = src.length - b64starts;
          if (b64length < 133) { elem.removeAttribute("src"); return; }
        }
        if ((src || srcset) && (!elem.className.toLowerCase().includes("lazy"))) return;
        var copyTo = elem;
        if (copyTo.tagName.toLowerCase() === "figure") {
          copyTo = elem.querySelector("img, picture") || copyTo;
        }
        for (var j = 0; j < elem.attributes.length; j++) {
          var attr = elem.attributes[j];
          if (["src", "srcset", "alt"].indexOf(attr.name) >= 0) continue;
          var copyNewTo = null;
          if (/\.(jpg|jpeg|png|webp|gif)\s/.test(attr.value) || /^\s*\S+\.(jpg|jpeg|png|webp|gif)\S*\s*$/.test(attr.value)) {
            copyNewTo = "srcset";
          } else if (/^\s*\S+\.(jpg|jpeg|png|webp|gif)\S*\s*$/.test(attr.value)) {
            copyNewTo = "src";
          }
          if (copyNewTo) {
            var nodeType = copyTo.nodeName.toLowerCase();
            if (nodeType === "img" || nodeType === "picture") {
              copyTo.setAttribute(copyNewTo, attr.value);
            }
          }
        }
      }, this);
    },

    _getRowAndColumnCount: function (table) {
      var rows = 0, columns = 0;
      var trs = table.querySelectorAll("tr");
      Array.from(trs).forEach(function (tr) {
        var rowspan = tr.getAttribute("rowspan") || 0;
        rows += (rowspan || 1);
        var columnsInThisRow = 0;
        Array.from(tr.querySelectorAll("td,th")).forEach(function (cell) {
          var colspan = cell.getAttribute("colspan") || 0;
          columnsInThisRow += (colspan || 1);
        });
        columns = Math.max(columns, columnsInThisRow);
      });
      return { rows: rows, columns: columns };
    },

    _cleanStyles: function (e) {
      if (!e || e.tagName.toLowerCase() === "svg") return;
      if (e.className !== "readability-styled") {
        e.removeAttribute("style");
      }
      Array.from(e.children).forEach(function (node) { this._cleanStyles(node); }, this);
    },

    _clean: function (e, tag) {
      var isEmbed = ["object", "embed", "iframe"].indexOf(tag) !== -1;
      this._removeNodes(this._getAllNodesWithTag(e, [tag]), function (element) {
        if (isEmbed) {
          if (this._allowedVideoRegex.test(Array.from(element.attributes).map(function (attr) { return attr.value; }).join(" "))) return false;
          if (element.textContent.search(this._allowedVideoRegex) !== -1) return false;
        }
        return true;
      });
    },

    _cleanHeaders: function (e) {
      var headingNodes = this._getAllNodesWithTag(e, ["h1", "h2"]);
      this._removeNodes(headingNodes, function (node) {
        var shouldRemove = this._getClassWeight(node) < 0;
        return shouldRemove;
      });
    },

    _cleanMatchedNodes: function (e, filter) {
      var endOfSearchMarkerNode = this._getNextNode(e, true);
      var next = this._getNextNode(e);
      while (next && next != endOfSearchMarkerNode) {
        if (filter.call(this, next, next.className + " " + next.id)) {
          next = this._removeAndGetNext(next);
        } else {
          next = this._getNextNode(next);
        }
      }
    },

    _cleanConditionally: function (e, tag) {
      if (!this._hasFlag(this.FLAG_CLEAN_CONDITIONALLY)) return;
      this._removeNodes(this._getAllNodesWithTag(e, [tag]), function (node) {
        if (tag === "table" && node._readabilityDataTable) return false;
        if (this._hasAncestorTag(node, "table", -1, function (n) { return n._readabilityDataTable; })) return false;
        if (this._hasAncestorTag(node, "code")) return false;

        var isList = tag === "ul" || tag === "ol";
        var isDataTable = function (t) { return t._readabilityDataTable; };

        var weight = this._getClassWeight(node);
        if (weight + this._getLinkDensity(node) < 0) return true;
        if (!isList && node.querySelectorAll("li").length - 100 > 0) return true;

        var toRemove = false;
        var p = node.querySelectorAll("p").length;
        var img = node.querySelectorAll("img").length;
        var li = node.querySelectorAll("li").length - 100;
        var input = node.querySelectorAll("input").length;
        var headingDensity = this._getTextDensity(node, ["h1", "h2", "h3", "h4", "h5", "h6"]);

        var embedCount = 0;
        var embeds = node.querySelectorAll("object, embed, iframe");
        embeds.forEach(function (embed) {
          if (this._allowedVideoRegex.test(embed.getAttribute("src") || "")) embedCount++;
          if (this._allowedVideoRegex.test(embed.textContent)) embedCount++;
        }, this);

        var linkDensity = this._getLinkDensity(node);
        var contentLength = this._getInnerText(node).length;

        if (img > p && !isList && !this._hasAncestorTag(node, "figure")) toRemove = true;
        else if (!isList && li > p) toRemove = true;
        else if (input > Math.floor(p / 3)) toRemove = true;
        else if (!isList && headingDensity < 0.9 && contentLength < 25 && (img === 0 || img > 2) && !this._hasAncestorTag(node, "figure")) toRemove = true;
        else if (!isList && weight < 25 && linkDensity > 0.2) toRemove = true;
        else if (weight >= 25 && linkDensity > 0.5) toRemove = true;
        else if ((embedCount === 1 && contentLength < 75) || embedCount > 1) toRemove = true;

        if (isList && toRemove) {
          var listNodes = node.querySelectorAll("li");
          var itemLength = Array.from(listNodes).reduce(function (max, listNode) {
            return Math.max(max, this._getInnerText(listNode).length);
          }.bind(this), 0);
          if (itemLength > 200) toRemove = false;
        }

        return toRemove;
      });
    },

    _hasAncestorTag: function (node, tagName, maxDepth, filterFn) {
      maxDepth = maxDepth || 3;
      tagName = tagName.toUpperCase();
      var depth = 0;
      while (node.parentNode) {
        if (maxDepth > 0 && depth > maxDepth) return false;
        if (node.parentNode.tagName === tagName && (!filterFn || filterFn(node.parentNode))) return true;
        node = node.parentNode;
        depth++;
      }
      return false;
    },

    _getTextDensity: function (e, tags) {
      var textLength = this._getInnerText(e, true).length;
      if (textLength === 0) return 0;
      var childrenLength = 0;
      var children = this._getAllNodesWithTag(e, tags);
      Array.from(children).forEach(function (child) {
        childrenLength += this._getInnerText(child, true).length;
      }, this);
      return childrenLength / textLength;
    },

    _removeNodes: function (nodeList, filterFn) {
      for (var i = nodeList.length - 1; i >= 0; i--) {
        var node = nodeList[i];
        var parentNode = node.parentNode;
        if (parentNode) {
          if (!filterFn || filterFn.call(this, node, i, nodeList)) parentNode.removeChild(node);
        }
      }
    },

    _replaceNodeTags: function (nodeList, newTagName) {
      Array.from(nodeList).forEach(function (node) {
        this._setNodeTag(node, newTagName);
      }, this);
    },

    _getAllNodesWithTag: function (node, tagNames) {
      if (node.querySelectorAll) return node.querySelectorAll(tagNames.join(","));
      return [].concat.apply([], tagNames.map(function (tag) { return Array.from(node.getElementsByTagName(tag)); }));
    },

    _hasSingleTagInsideElement: function (element, tag) {
      if (element.children.length != 1 || element.children[0].tagName !== tag) return false;
      return !Array.from(element.children[0].children).some(function (child) { return child.tagName === tag; });
    },

    _setNodeTag: function (node, tag) {
      if (this._docJSDOMParser) {
        node.localName = tag.toLowerCase();
        node.tagName = tag.toUpperCase();
        return node;
      }
      var replacement = node.ownerDocument.createElement(tag);
      while (node.firstChild) replacement.appendChild(node.firstChild);
      node.parentNode.replaceChild(replacement, node);
      if (node.readability) replacement.readability = node.readability;
      Array.from(node.attributes).forEach(function (attr) {
        try { replacement.setAttribute(attr.name, attr.value); } catch (ex) {}
      });
      return replacement;
    },

    _removeNode: function (node) {
      if (node && node.parentNode) node.parentNode.removeChild(node);
    },

    _nextNode: function (node) {
      var next = node;
      while (next && (next.nodeType !== this.ELEMENT_NODE) && REGEXPS.whitespace.test(next.textContent)) next = next.nextSibling;
      return next;
    },

    _getSiteName: function () {
      var ogSite = this._doc.querySelector("meta[property='og:site_name']");
      if (ogSite) return ogSite.getAttribute("content");
      return null;
    },

    parse: function () {
      if (this.MAX_ELEMS_TO_PARSE > 0) {
        var numTags = this._doc.getElementsByTagName("*").length;
        if (numTags > this.MAX_ELEMS_TO_PARSE) {
          throw new Error("Aborting parsing document; " + numTags + " elements found");
        }
      }

      var metadata = this._getArticleMetadata();
      this._articleTitle = metadata.title;

      var articleContent = this._grabArticle();
      if (!articleContent) return null;

      var textContent = articleContent.textContent;
      var byline = metadata.byline || this._articleByline;
      var dir = this._articleDir;
      var lang = this._doc.documentElement.getAttribute("lang");
      var publishedTime = metadata.publishedTime;
      var siteName = this._getSiteName() || metadata.siteName;

      return {
        title: this._articleTitle,
        byline: byline,
        dir: dir,
        lang: lang,
        content: this._serializer(articleContent),
        textContent: textContent,
        length: textContent.length,
        excerpt: metadata.excerpt,
        siteName: siteName,
        publishedTime: publishedTime,
      };
    },

    _getArticleMetadata: function () {
      var metadata = {};
      var values = {};
      var metaElements = this._doc.querySelectorAll("meta");

      var propertyPattern = /\s*(article|dc|dcterm|og|twitter)\s*:\s*(author|creator|description|published_time|title|site_name)\s*/gi;
      var namePattern = /^\s*(?:(dc|dcterm|og|twitter|weibo:(article|webpage))\s*[\.:]\s*)?(author|creator|description|title|site_name)\s*$/i;

      Array.from(metaElements).forEach(function (element) {
        var elementName = element.getAttribute("name");
        var elementProperty = element.getAttribute("property");
        var content = element.getAttribute("content");
        if (!content) return;
        var matches = null;
        var name = null;

        if (elementProperty) {
          matches = elementProperty.match(propertyPattern);
          if (matches) {
            name = matches[0].toLowerCase().replace(/\s/g, "");
            values[name] = content.trim();
          }
        }
        if (!matches && elementName && namePattern.test(elementName)) {
          name = elementName;
          if (content) values[name] = content.trim();
        }
      });

      metadata.title = values["og:title"] || values["twitter:title"] || values["title"] || "";
      metadata.byline = values["dc:creator"] || values["dcterm:creator"] || values["author"] || "";
      metadata.excerpt = values["dc:description"] || values["dcterm:description"] || values["og:description"] || values["twitter:description"] || values["description"] || "";
      metadata.siteName = values["og:site_name"] || "";
      metadata.publishedTime = values["article:published_time"] || "";
      metadata.title = metadata.title || this._getArticleTitle();

      return metadata;
    },
  };

  if (typeof module === "object") {
    module.exports = Readability;
  } else {
    global.Readability = Readability;
  }
}(typeof window !== "undefined" ? window : this));
