const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_"
function yeast(){
    num = Math.floor(Date.now())
    encoded = ""
    while (num > 0 || encoded == ""){
        encoded = alphabet[num % alphabet.length] + encoded
        num = Math.floor(num /alphabet.length)
	}
    return encoded
}

function timesync(){
	return '425[18,{"jsonrpc":"2.0","id":5,"method":"timesync"}]';
}

function emit(list,type,args) {
	for (let i of list){
		if (i[0] == type){
			i[1](args);
		}
	}
}

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const https = require('https')
const WebSocket = require('ws');

const agent = new https.Agent({
	rejectUnauthorized: false,	
});	

class hitbot{
	constructor(options) {
		options = options || {};
		options.name = options.name || "Hitbot";
		options.token = options.token || "";
		options.skin = options.skin || 3428095;
		this.options = options;
		this.connected = false;
		this.events = [];
		this.lobby = {
			id: 0,
			host: 0,
			users: [],
			settings: {}
		}
	}
	async setToken(name,pass){
		let token = await fetch(`https://hitbox.io/scripts/login_register_multi.php`,{
			method: "POST",
			headers:{'content-type': "application/x-www-form-urlencoded; charset=UTF-8"},
			body:`register=&username=${name}&password=${pass}&remember=false`	
		})
		token = await token.json();
		this.options.name = name;
		this.options.token = token.token;
		return token;
	}
	convertPacket(data){
		/*if (data[0] == 7) {
			return {type:"join",lobby:this.lobby};
		}
		if (data[0] == 29){
			let user = this.findUser(data[1]);
			return {type:"message",content:data[2],author:user};
		}*/
		return data;
	}
	handlePacket(data) {
		if (data[0] == 7){
			this.lobby.id = data[1][0];
            this.lobby.host = data[1][1];
			for (let i of data[1][3]){
                this.lobby.users.push({"team": i[2],"color":(i[7][0] || i[7][1]),"name":i[0],"id":i[4],"lvl":i[6]});
            }
		}
		if (data[0] == 9){
			setTimeout(() => {
				this.lobby.host = data[2];
				let user = this.findUser(data[1]);
				if (user){
					this.lobby.users.splice(user.index,1);
				}
			},5);
        }
		if (data[0] == 8){
			this.lobby.users.push({"name":data[1][0],"color":(data[7]? (data[7][1] || data[7][0]):undefined),"team":data[1][2],"id":data[1][4],"lvl":data[1][6]});
		}
	}
	findUser(id) {
		  for (let t in this.lobby.users) {
            let o = this.lobby.users[t];
            if (o.id == id || o.name == id){
                o.index = t;
                return o;
                break;
            }
        }
	}
	async connect(address) {
		if (this.connected) return;
			let peer = await fetch(`https://${address.server}.hitbox.io/peer/peerjs/id`,{
				method: 'GET',
				headers: {
					'accept':'*\/*',
					'accept-encoding': 'gzip, deflate, br',
					'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
					'connection':'keep-alive'
				},
				agent
			});
			peer = await peer.text();
			let sessionYeast = yeast();
			let response = await fetch(`https://${address.server}.hitbox.io/socket.io/?EIO=3&transport=polling&t=${sessionYeast}`,{
				method: "GET",
				headers: {
					'accept':'*/*',
					'accept-encoding': 'gzip, deflate, br',
					'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
					'connection':'keep-alive'
				},
				agent
			});
			response = await response.text();
			response = JSON.parse(response.split("96:0")[1])
			let ws = new WebSocket(`wss://${address.server}.hitbox.io/socket.io/?EIO=3&transport=websocket&sid=${response.sid}`,{agent})
			this.ws = ws;
			const self = this;
			ws.on('error', console.error);
			ws.on('close', (error) => {console.log(String(error))});
				ws.on('open', function open() {
				console.log("Hitbot connected! attempting to join room")
				ws.send("2probe");
				ws.send("5");
				ws.send(timesync());
				let roomInfo = `42[2,{"token":"${self.options.token}","version":64,"i":4,"a":"8*^^86%ff^GjtudfjHg2","joinID":"${address.address}","playerName":"${self.options.name}","peerID":"","password":"${address.passbypass || ""}","cosmetic":{"1":${self.options.skin}}}]`;
				ws.send(roomInfo)
				setInterval(() => {
					ws.send(timesync())
				},1000);
				self.connected = true;
			});
			ws.on('message', function message(data) {
				if (String(data).startsWith('42')){
					data = JSON.parse(String(data).slice(2,String(data).length));
					self.handlePacket.call(self,data);
					emit(self.events,"message",data);
				}
			});
	}
	disconnect(){
		this.ws.close();
		this.ws = null;
		this.connected = false;
	}
	on(event,func){
		this.events.push([event,func]);
	}
	msg(content){
		if (this.connected){
			this.ws.send('42'+JSON.stringify([1,[28,content]]));
		}
	}
	async addr_from_link(link) {
		let r = await fetch(link,{
			method: "GET",
			agent
		})
		r = await r.text();
		let address = [...r.match(/autoJoin = \{(.*?)};/ig)][0];
		if (address){
			address = JSON.parse(address.split("autoJoin = ")[1].split(";")[0]);
			return address;
		}
	}

	async addr_from_name(roomname) {
			let r = await fetch("https://hitbox.io/scripts/customroom_get.php",{
				method: "POST",
				headers:{'content-type': "application/x-www-form-urlencoded; charset=UTF-8"},
				body:`gl=n&version=57`
			})
			r = await r.json();
			for (let i of r.rooms){
				if (i.roomname == roomname){
					let address = await fetch("https://hitbox.io/scripts/getroomaddress.php",{
						method: "POST",
						headers:{'content-type': "application/x-www-form-urlencoded; charset=UTF-8"},
						body:`id=${i.id}`
					});
					address = await address.json();
					return address;
				}
			}
	}
}

module.exports = hitbot;
