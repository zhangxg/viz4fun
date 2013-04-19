treemap = function(config) {

    // 定义x轴的输出域，默认为整张图的宽度
    var xscale = d3.scale.linear().range([0, config.width]);
    // 定义y轴的输出域，默认为整 张图的高度
    var yscale = d3.scale.linear().range([0, config.height]);
    // 定义填充色的输入，输出域
    var color = d3.scale.linear().domain(config.fillColour.domain).range(config.fillColour.range);
    // 定义treemap对像，treemap只是内存中的一个对像，不是html的显示元素
    var treemap = d3.layout.treemap().round(false).size([config.width, config.height]).sticky(true).value(config.valueCallback);
    treemap.config = config;
    // 在所有Div中查找给定区域,select方法返回的是二维数组
    var chartDiv = d3.select("div#" + config.reader);
    // 在给定的填充区域中追加html的显示元素
    var chart = chartDiv.append("svg").attr("width", config.width).attr("height", config.height);

    // 把绘图的数据放入treemap对像，用来与zoom和其它事件相互传递
    treemap.node = treemap.root = d3.json.parseFromText(config.data);

    // 调用生成treemap逻辑
    buildTreeMap(treemap, chart);

    /**
     * treemap生成逻辑。
     * (1)根据传入的node信息，分别生成父子节点对应的html元素
     * (2)调用zoom方法，对rectt和text元素进行位置定位和高度、宽度设计
     * @param {Object} treemap d3生成的treemap对像，主要用treemap里的node和root信息
     * @param {Object} chart 目标html区域对像
     */
    function buildTreeMap(treemap, chart) {
        // 给root对像填加treemap信息(x,y,dx,dy,depth等)
        var nodes = treemap.nodes(treemap.root);
        var children = [];
        var parents = [];
        treemap.searchMap = new Map();
        // 为search作数据准备
        var searchObj = treemap.config.search;
        for (var i = 0; i < nodes.length; i++) {
            // 作父子节点的分类
            if (nodes[i].children && nodes[i] != treemap.root) {
                // 如果是父节点
                parents.push(nodes[i]);
            } else {
                // 不是父节点，就是子节点
                children.push(nodes[i]);
            }

            if (searchObj != undefined) {
                // TODO 这个地方的判断强度不够
                // 因为search对像内部reader, keys和id必须同时存在，并且不为空
                for (var j = 0; j < searchObj.keys.length; j++) {
                    treemap.searchMap.put(nodes[i][searchObj.keys[j]], nodes[i][searchObj.id]);
                }
            }
        }

        // 为所有父节点添加元素
        var parentCells = chart.selectAll("svg").data(parents, function(d) {
            return "p-" + d.name;
        });

        var parentEnterTransition = parentCells.enter().append("g").attr("class", "cell parent").on("click", function(d) {
            zoom.call(treemap, d);
        });

        parentEnterTransition.append("rect").attr("id", function (d) {
            return d.code;
        });
        parentEnterTransition.append('text').attr("class", "label").style("fill", "white");

        // remove transition
        parentCells.exit().remove();

        // 为所有子节点添加元素
        var childrenCells = chart.selectAll("svg").data(children, function(d) {
            return "c-" + d.name;
        });
        // enter transition
        var childEnterTransition = childrenCells.enter().append("g").attr("class", "cell child")
        /*.on("click", function(d) {
         zoom.call(treemap, treemap.node === d.parent ? treemap.root : d.parent);
         })*/;

        childEnterTransition.append("rect").classed("background", true).attr("id", function(d) {
            return d.code;
        });
        childEnterTransition.append('text').attr("class", "labelbody");

        // exit transition
        childrenCells.exit().remove();
        
        // 加入Search功能
        buildSearch(treemap);
        // 设计zoom的this为treemap对像
        zoom.call(treemap, treemap.node);
    }

    /**
     * 导航条的生成逻辑，在zoom中被调用
     * @param {Object} treemap 上下文用的treemap
     * @param {Object} node 当前zoom的节点
     */
    function buildNavigation(treemap, node) {
        // 如果外层调用时，配置项中没传入导航位置，后面就都不用作了
        if (treemap.config.navigation == undefined) {
            return;
        }

        // 如果当前节点就是数组的最后一个节点，就不用再创建了
        if (treemap.navs != undefined && treemap.navs.length > 0 && treemap.navs[treemap.navs.length - 1] == node) {
            return;
        }

        // 取得所有已经存在导航，但对于第一次创建，基本应该都是0
        var outdiv = d3.select("div#" + treemap.config.navigation);
        // 判断一下当前有多少导航的div，注意selectAll返回的是二维数组
        var allA = outdiv.selectAll("div");
        var index = allA[0].length;

        // 创建导航div，求一下内部div的下沉值
        var d = outdiv.append("div").attr("id", index).attr("class", "row-left").style("margin", (outdiv[0][0].clientHeight - 20) + "px 5px 0px 0px");
        d.on("click", function() {
            var id = this.id;
            navCallback.call(treemap, id);
        });

        if (node.depth == 0) {
            d.append("a").attr("href", "#").text("All");
        } else {
            d.append("a").attr("href", "#").text(node.name);
        }

        // 保存当前节点，为以后回退的时候作准备
        if (treemap.navs == undefined) {
            treemap.navs = [];
        }
        treemap.navs.push(node);
    }

    /**
     * 导航条的点击回调方法
     * @param {Object} index 导航条的索引号。从0开始，顺序与treemap.navs的序列一至
     */
    function navCallback(index) {
        // 重定义this的名字
        var treemap = this;
        for (var i = treemap.navs.length - 1; i > index; i--) {
            // 把产生导航事件的节点，后面的节点全部移
            treemap.navs.pop();
            var tmpdiv = document.getElementById(i);
            tmpdiv.parentNode.removeChild(tmpdiv);
        }

        zoom.call(treemap, treemap.navs[index]);
    }

    function buildSearch(treemap) {
        // 接出search对像，只是觉得代码有些长
        var search = treemap.config.search;
        // 取得外层div
        var outdiv = d3.select("div#" + search.reader);
        // 追加文本框，需要算一下内部对像下沉值，只设置一次就可以
        outdiv.append("input").attr("type", "text").attr("id", "build-search-text").style("margin", (outdiv[0][0].clientHeight - 20) + "px 0px 0px 0px");
        // 追加按钮，需要设计点击事件的回调
        outdiv.append("input").attr("type", "button").attr("value", "Go").on("click", function() {
            var val = document.getElementById("build-search-text").value;
            if (val != null && val != "") {
                // 只有输入了值，才进行查询，否则无反应
                searchCallback.call(treemap, val);
            }
        })
    }

    function searchCallback(key) {
        var eleId = treemap.searchMap.get(key);
        if (eleId != undefined && eleId != null) {
            var rect = document.getElementById(eleId);
            rect.style.stroke = "black";
            rect.style.strokeWidth = "1px";
            //alert(rect.id);
        }
    }

    function zoom(d) {
        //var config = treemap.config;
        var treemap = this;

        buildNavigation(treemap, d);

        treemap.padding([config.header.height / (config.height / d.dy), 0, 0, 0]).nodes(d);

        var kx = config.width / d.dx;
        var ky = config.height / d.dy;
        var level = d;

        xscale.domain([d.x, d.x + d.dx]);
        if (d.depth == 0 && d.children.length != 0) {
            yscale.domain([d.children[0].y, d.children[0].y + d.dy]);
        } else {
            yscale.domain([d.y, d.y + d.dy]);
        }

        var zoomTransition = chart.selectAll("g.cell").transition().duration(config.transitionDuration).attr("transform", function(d) {
            return "translate(" + xscale(d.x) + "," + yscale(d.y) + ")";
        }).each("start", function() {
            d3.select(this).select(".labelbody").style("display", "none");
        }).each("end", function(d) {
            if ((level !== treemap.root)) {
                chart.selectAll(".cell.child").filter(function(d) {
                    return d.parent === treemap.node;
                    // only get the children for selected group
                }).select("text").style("display", "").style("color", function(d) {
                    // return idealTextColor(color(d.parent.name));
                    return color(d.value);
                });
            }
        });

        zoomTransition.select("text").attr("dx", function(d) {
            return Math.max(0.01, kx * d.dx / 2 - 1);
        }).attr("dy", function(d) {
            return d.children ? config.header.height - 5 : Math.max(0.01, ky * d.dy / 2 - 1);
        }).text(function(d) {
            if (d.children) {
                return d.name;
            } else {
                return d.name + "(" + d.value + ")" + "-" + color(d.value);
            }
        });

        // update the width/height of the rects
        zoomTransition.select("rect").attr("width", function(d) {
            return Math.max(0.01, kx * d.dx - 1);
        }).attr("height", function(d) {
            return d.children ? config.header.height : Math.max(0.01, ky * d.dy - 1);
        }).style("fill", function(d) {
            return d.children ? config.header.colour : color(d.value);
        });

        treemap.node = d;

        if (d3.event) {
            d3.event.stopPropagation();
        }
    }

};

function Map() {
    /** Save the keys */
    this.keys = new Array();
    /** Save the values */
    this.data = new Object();

    /**
     * Put a key/value
     * @param {String} key
     * @param {Object} value
     */
    this.put = function(key, value) {
        if(this.data[key] == null){
            this.keys.push(key);
        }
        this.data[key] = value;
    };

    /**
     * Get a key/value
     * @param {String} key
     * @return {Object} value
     */
    this.get = function(key) {
        return this.data[key];
    };
};
